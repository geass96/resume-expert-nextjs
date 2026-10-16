import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import { historyDb } from "./history-db.ts";
import { saveSubscription, SIWC_AUTH, SIWC_SCOPE, type SiwcRecord } from "./chatgpt-subscription.ts";

const EXPIRY_MS = 12 * 60 * 1000;
function storage(){
 const d=historyDb();
 d.exec(`CREATE TABLE IF NOT EXISTS chatgpt_browser_pair(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  secret_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
 );`);
 return d;
}
function hash(token:string){
 return createHash("sha256").update("resume-siwc-browser-pair-v1:"+token).digest("hex");
}
export function createBrowserPair(){
 const token=randomBytes(32).toString("base64url");
 storage().prepare("INSERT INTO chatgpt_browser_pair(singleton,secret_hash,expires_at) VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE SET secret_hash=excluded.secret_hash,expires_at=excluded.expires_at")
 .run(hash(token),Date.now()+EXPIRY_MS);
 return {token,expiresInSeconds:Math.floor(EXPIRY_MS/1000)};
}
export function pairIsValid(token:string){
 if(typeof token!=="string"||!/^[\w-]{40,60}$/.test(token))return false;
 const row=storage().prepare("SELECT secret_hash,expires_at FROM chatgpt_browser_pair WHERE singleton=1").get() as
  {secret_hash:string;expires_at:number}|undefined;
 return !!row && row.expires_at>Date.now() && row.secret_hash===hash(token);
}
async function verifyOpenAiCredential(record:SiwcRecord){
 if(record.issuer!==SIWC_AUTH||!/^oaiapp_[\w-]{5,150}$/.test(record.client_id)||
    !record.subject||!record.id_token||!record.access_token||!record.refresh_token||
    !record.scope?.split(/\s+/).includes(SIWC_SCOPE))throw Error("无效的订阅凭据");
 const split=record.id_token.split(".");
 if(split.length!==3)throw Error("ID Token 格式无效");
 const header=JSON.parse(Buffer.from(split[0],"base64url").toString()) as {alg:string;kid?:string};
 if(header.alg!=="RS256"||!header.kid)throw Error("不支持的签名算法");
 const discovery=await fetch(SIWC_AUTH+"/.well-known/openid-configuration",
  {cache:"no-store",signal:AbortSignal.timeout(12000)}).then(r=>{if(!r.ok)throw Error("无法确认发行方");return r.json();}) as {issuer?:string;jwks_uri?:string};
 if(discovery.issuer!==SIWC_AUTH||!discovery.jwks_uri||new URL(discovery.jwks_uri).origin!==SIWC_AUTH)
  throw Error("OAuth 发现文档未通过校验");
 const jwks=await fetch(discovery.jwks_uri,{cache:"no-store",signal:AbortSignal.timeout(12000)})
  .then(r=>{if(!r.ok)throw Error("无法获取验证密钥");return r.json();}) as {keys?:Array<Record<string,unknown>>};
 const jwk=jwks.keys?.find(k=>k.kid===header.kid&&k.kty==="RSA"&&k.use==="sig");
 if(!jwk||!verify("RSA-SHA256",Buffer.from(split[0]+"."+split[1]),
  createPublicKey({key:jwk,format:"jwk"}),Buffer.from(split[2],"base64url")))throw Error("ID Token 签名验证失败");
 const claims=JSON.parse(Buffer.from(split[1],"base64url").toString()) as {
  iss:string;aud:string|string[];sub:string;exp:number;iat?:number;
 };
 const now=Math.floor(Date.now()/1000);
 if(claims.iss!==SIWC_AUTH||
  !(claims.aud===record.client_id||Array.isArray(claims.aud)&&claims.aud.includes(record.client_id))||
  claims.sub!==record.subject||!claims.sub||
  !Number.isFinite(claims.exp)||claims.exp<=now||
  (claims.iat!==undefined&&(!Number.isFinite(claims.iat)||claims.iat>now+60))||
  !Number.isFinite(record.expires_in)||record.expires_in<60||record.expires_in>86400||
  !Number.isFinite(Date.parse(record.saved_at))||Math.abs(Date.now()-Date.parse(record.saved_at))>5*60*1000)
   throw Error("OAuth 身份或时效验证失败");
}
export async function completeBrowserPair(token:string,record:SiwcRecord){
 if(!pairIsValid(token))throw Error("配对已过期，请重新发起连接");
 await verifyOpenAiCredential(record);
 const db=storage();
 db.exec("BEGIN IMMEDIATE");
 try {
  if(!pairIsValid(token))throw Error("连接请求已使用或失效");
  db.prepare("DELETE FROM chatgpt_browser_pair WHERE singleton=1").run();
  saveSubscription(record);
  db.exec("COMMIT");
 }catch(err){db.exec("ROLLBACK");throw err;}
}
