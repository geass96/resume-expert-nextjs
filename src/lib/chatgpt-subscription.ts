import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { historyDb } from "./history-db.ts";

export const SIWC_BASE = "https://api.openai.com/v1";
export const SIWC_AUTH = "https://auth.openai.com";
export const SIWC_SCOPE = "chatgpt.tokens.use.direct";
export type SiwcRecord = {
  issuer:string;subject:string;email?:string;client_id:string;
  access_token:string;refresh_token:string;id_token:string;
  scope:string;expires_in:number;saved_at:string;ext_agent_host_id:string;
};
function database(){
 const db=historyDb();
 db.exec(`CREATE TABLE IF NOT EXISTS chatgpt_subscription (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  encrypted_json TEXT NOT NULL,
  model TEXT NOT NULL,
  updated_at TEXT NOT NULL
 ); CREATE TABLE IF NOT EXISTS chatgpt_host (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  host_id TEXT NOT NULL
 ); CREATE TABLE IF NOT EXISTS model_selection(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1), selected_id TEXT, mode TEXT NOT NULL
 );`);
 return db;
}
function encryptionKey(){
 const secret=process.env.RESUME_MODEL_ENCRYPTION_KEY || process.env.RESUME_SESSION_SECRET;
 if(!secret || secret.length<32)throw new Error("服务器缺少订阅凭据加密配置");
 return createHash("sha256").update("resume-chatgpt-siwc-v1:"+secret).digest();
}
function encrypt(value:string){
 const iv=randomBytes(12), cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);
 cipher.setAAD(Buffer.from("resume-expert-siwc-v1"));
 const raw=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
 return [iv,cipher.getAuthTag(),raw].map(b=>b.toString("base64url")).join(".");
}
function decrypt(encoded:string){
 const chunks=encoded.split(".");
 if(chunks.length!==3)throw new Error("订阅凭据格式异常");
 const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(chunks[0],"base64url"));
 decipher.setAAD(Buffer.from("resume-expert-siwc-v1"));
 decipher.setAuthTag(Buffer.from(chunks[1],"base64url"));
 return Buffer.concat([decipher.update(Buffer.from(chunks[2],"base64url")),decipher.final()]).toString("utf8");
}
function readConnection():{value:SiwcRecord;model:string;revision:string}|null{
 const row=database().prepare("SELECT encrypted_json,model FROM chatgpt_subscription WHERE singleton=1").get() as
   {encrypted_json:string;model:string}|undefined;
 return row?{value:JSON.parse(decrypt(row.encrypted_json)),model:row.model,revision:row.encrypted_json}:null;
}
function writeConnection(value:SiwcRecord,model:string){
 database().prepare("INSERT INTO chatgpt_subscription(singleton,encrypted_json,model,updated_at) VALUES(1,?,?,?) ON CONFLICT(singleton) DO UPDATE SET encrypted_json=excluded.encrypted_json,model=excluded.model,updated_at=excluded.updated_at")
 .run(encrypt(JSON.stringify(value)),model,new Date().toISOString());
}
function modelValid(model:string){return /^[a-zA-Z0-9._\-]{2,90}$/.test(model);}
export function getOrCreateHostId(){
 const db=database();
 const existing=db.prepare("SELECT host_id FROM chatgpt_host WHERE singleton=1").get() as {host_id:string}|undefined;
 if(existing)return existing.host_id;
 const hostId="urn:uuid:"+randomUUID();
 db.prepare("INSERT OR IGNORE INTO chatgpt_host(singleton,host_id) VALUES(1,?)").run(hostId);
 return (db.prepare("SELECT host_id FROM chatgpt_host WHERE singleton=1").get() as {host_id:string}).host_id;
}
export function saveSubscription(value:SiwcRecord){
 if(value.issuer!==SIWC_AUTH || !value.subject ||
   !/^oaiapp_[\w-]{5,150}$/.test(value.client_id) ||
   !value.access_token || !value.refresh_token || !value.id_token ||
   !value.scope?.split(/\s+/).includes(SIWC_SCOPE) ||
   !Number.isFinite(value.expires_in) || value.expires_in<=0 || value.expires_in>86400 ||
   !Number.isFinite(Date.parse(value.saved_at)))throw new Error("OAuth 授权文件不完整或没有订阅使用许可");
 // The host ID belongs to this VM; it must never be overwritten by the laptop's ID.
 getOrCreateHostId();
 const prior=readConnection();
 writeConnection(value,prior?.model||"gpt-6.1-sol");
}
export function subscriptionStatus(){
 const db=database();
 const exists=db.prepare("SELECT model,updated_at FROM chatgpt_subscription WHERE singleton=1").get() as {model:string;updated_at:string}|undefined;
 const selected=db.prepare("SELECT mode FROM model_selection WHERE singleton=1").get() as {mode:string}|undefined;
 return {connected:!!exists,active:exists!==undefined&&selected?.mode==="siwc",model:exists?.model||null,
 updatedAt:exists?.updated_at||null,mode:"local-loopback-ssh",hostId:getOrCreateHostId()};
}
export function selectSubscription(model:string){
 if(!modelValid(model))throw new Error("模型 ID 无效");
 const record=readConnection();
 if(!record)throw new Error("尚未完成 ChatGPT 订阅授权导入");
 // Selecting a model does not replace the credentials a refresh is updating.
 database().prepare("UPDATE chatgpt_subscription SET model=?,updated_at=? WHERE singleton=1")
   .run(model,new Date().toISOString());
 database().prepare("INSERT INTO model_selection(singleton,selected_id,mode) VALUES(1,NULL,'siwc') ON CONFLICT(singleton) DO UPDATE SET selected_id=NULL,mode='siwc'").run();
}
export function selectedSubscription(){
 const db=database();
 const selected=db.prepare("SELECT mode FROM model_selection WHERE singleton=1").get() as {mode:string}|undefined;
 if(selected?.mode!=="siwc")return null;
 const row=db.prepare("SELECT model FROM chatgpt_subscription WHERE singleton=1").get() as {model:string}|undefined;
 return row?{model:row.model}:null;
}
export async function subscriptionAccessToken(force=false):Promise<string>{
 const current=readConnection();
 if(!current)throw new Error("ChatGPT 订阅尚未连接");
 const age=(Date.now()-Date.parse(current.value.saved_at))/1000;
 if(!force && age<current.value.expires_in-180)return current.value.access_token;
 return refresh(force);
}
let inflight:{revision:string;promise:Promise<string>}|undefined;
function refresh(force:boolean):Promise<string>{
 const current=readConnection();
 if(!current)return Promise.reject(new Error("订阅已断开"));
 if(inflight?.revision===current.revision)return inflight.promise;
 const promise:Promise<string>=(async()=>{
   const age=(Date.now()-Date.parse(current.value.saved_at))/1000;
   if(!force && age<current.value.expires_in-180)return current.value.access_token;
   const form=new URLSearchParams({grant_type:"refresh_token",client_id:current.value.client_id,
     refresh_token:current.value.refresh_token,resource:SIWC_BASE});
   const res=await fetch(SIWC_AUTH+"/api/accounts/oauth/token",{
     method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form,
     signal:AbortSignal.timeout(15000),cache:"no-store"});
   if(!res.ok)throw new Error("ChatGPT 订阅授权刷新失败（HTTP "+res.status+"），请重新授权");
   const json=await res.json() as {access_token?:string;refresh_token?:string;expires_in?:number;scope?:string};
   if(!json.access_token||!json.refresh_token||!(json.scope||current.value.scope).split(/\s+/).includes(SIWC_SCOPE))
     throw new Error("刷新结果缺少 ChatGPT 订阅使用权限");
   const updated:SiwcRecord={...current.value,access_token:json.access_token,
     refresh_token:json.refresh_token,expires_in:json.expires_in||3600,scope:json.scope||current.value.scope,
     saved_at:new Date().toISOString()};
   // Compare the persisted credential revision, including across processes.
   // A disconnect or account import must invalidate this pending response.
   const saved=database().prepare("UPDATE chatgpt_subscription SET encrypted_json=?,updated_at=? WHERE singleton=1 AND encrypted_json=?")
     .run(encrypt(JSON.stringify(updated)),new Date().toISOString(),current.revision);
   if(saved.changes!==1)throw new Error("订阅连接已变更，请重新尝试");
   return json.access_token;
 })().finally(()=>{if(inflight?.promise===promise)inflight=undefined;});
 inflight={revision:current.revision,promise};
 return promise;
}
export async function disconnectSubscription(){
 const current=readConnection();
 if(!current)return {revoked:true};
 // Remove local authorization before any network wait. A later import then
 // belongs to a new connection and cannot be deleted by this revocation.
 const db=database();
 db.exec("BEGIN IMMEDIATE");
 try {
   const removed=db.prepare("DELETE FROM chatgpt_subscription WHERE singleton=1 AND encrypted_json=?").run(current.revision);
   if(removed.changes===1)
     db.prepare("UPDATE model_selection SET mode='mock',selected_id=NULL WHERE singleton=1 AND mode='siwc'").run();
   db.exec("COMMIT");
 }catch(err){db.exec("ROLLBACK");throw err;}
 let revoked=false;
 try {
   const metadata=await fetch(SIWC_AUTH+"/.well-known/openid-configuration",{signal:AbortSignal.timeout(8000)}).then(r=>r.json()) as {revocation_endpoint?:string};
   if(!metadata.revocation_endpoint || new URL(metadata.revocation_endpoint).origin!==SIWC_AUTH)throw Error("无法确认撤销端点");
   const res=await fetch(metadata.revocation_endpoint,{
     method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
     body:new URLSearchParams({token:current.value.refresh_token,token_type_hint:"refresh_token",
       client_id:current.value.client_id}),signal:AbortSignal.timeout(8000)});
   revoked=res.status===200;
 }catch{}
 return {revoked};
}
