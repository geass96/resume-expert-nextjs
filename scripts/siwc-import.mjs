#!/usr/bin/env node
// Run ONLY on the owner's Oracle VPS, with RESUME_DATA_DIR and encryption env configured.
// Pipe protected OAuth JSON through SSH stdin; never put tokens in command arguments or logs.
import { createCipheriv, createHash, createPublicKey, randomBytes, randomUUID, verify } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const issuer="https://auth.openai.com";
function key(){
 const value=process.env.RESUME_MODEL_ENCRYPTION_KEY||process.env.RESUME_SESSION_SECRET;
 if(!value||value.length<32)throw Error("缺少服务器加密密钥");
 return createHash("sha256").update("resume-chatgpt-siwc-v1:"+value).digest();
}
function encrypt(value){
 const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(),nonce);
 cipher.setAAD(Buffer.from("resume-expert-siwc-v1"));
 const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
 return [nonce,cipher.getAuthTag(),encrypted].map(x=>x.toString("base64url")).join(".");
}
async function validRecord(record){
 if(!record||record.issuer!==issuer || !/^oaiapp_[\w-]+$/.test(record.client_id||"")||
   !record.subject||!record.access_token||!record.refresh_token||!record.id_token ||
   !record.scope?.split(/\s+/).includes("chatgpt.tokens.use.direct")||
   !Number.isFinite(record.expires_in)||record.expires_in<=0||record.expires_in>86400||
   !Number.isFinite(Date.parse(record.saved_at)))throw Error("OAuth 记录缺失订阅许可或字段");
 const parts=record.id_token.split(".");
 if(parts.length!==3)throw Error("ID token 格式不正确");
 const header=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
 if(header.alg!=="RS256")throw Error("不允许的签名算法");
 const discover=await fetch(issuer+"/.well-known/openid-configuration",{signal:AbortSignal.timeout(12000)}).then(r=>r.json());
 const jwks=new URL(discover.jwks_uri);
 if(jwks.origin!==issuer)throw Error("不可信的 OpenID 密钥来源");
 const keys=await fetch(jwks,{signal:AbortSignal.timeout(12000)}).then(r=>r.json());
 const jwk=keys.keys?.find(x=>x.kid===header.kid&&x.kty==="RSA");
 if(!jwk||!verify("RSA-SHA256",Buffer.from(parts[0]+"."+parts[1]),createPublicKey({key:jwk,format:"jwk"}),Buffer.from(parts[2],"base64url")))
   throw Error("OpenAI ID token 签名无效");
 const claim=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8"));
 if(claim.iss!==issuer||!(claim.aud===record.client_id||Array.isArray(claim.aud)&&claim.aud.includes(record.client_id))||
   claim.sub!==record.subject||!Number.isFinite(claim.exp)||claim.exp<=Date.now()/1000)
   throw Error("ID token 账户、客户端或有效期不符");
}
const dataDir=process.env.RESUME_DATA_DIR;
if(!dataDir)throw Error("RESUME_DATA_DIR 未设置");
let text="";
for await(const chunk of process.stdin){
 text+=chunk.toString("utf8");
 if(text.length>64000)throw Error("凭据输入超出允许长度");
}
const record=JSON.parse(text);
await validRecord(record);
mkdirSync(dataDir,{recursive:true,mode:0o700});
const db=new DatabaseSync(join(dataDir,"resume-expert.sqlite"));
try{
 db.exec(`PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS chatgpt_subscription(
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 encrypted_json TEXT NOT NULL,
 model TEXT NOT NULL,
 updated_at TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS chatgpt_host(
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 host_id TEXT NOT NULL
 );`);
 db.prepare("INSERT OR IGNORE INTO chatgpt_host(singleton,host_id) VALUES(1,?)")
   .run("urn:uuid:"+randomUUID());
 const existing=db.prepare("SELECT model FROM chatgpt_subscription WHERE singleton=1").get();
 const model=existing?.model||"gpt-6.1-sol";
 db.prepare("INSERT INTO chatgpt_subscription(singleton,encrypted_json,model,updated_at) VALUES(1,?,?,?) ON CONFLICT(singleton) DO UPDATE SET encrypted_json=excluded.encrypted_json,updated_at=excluded.updated_at")
   .run(encrypt(JSON.stringify(record)),model,new Date().toISOString());
 console.log("SIWC_IMPORT_OK: 凭据经服务端加密保存；模型仍需在页面中手动启用。");
}finally{db.close();}
