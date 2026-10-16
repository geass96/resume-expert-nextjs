#!/usr/bin/env node
// Official Sign in with ChatGPT for this open-source, personal self-hosted app.
// OAuth happens locally on the user's computer; never on the remote VPS login page.
import { createHash, createPublicKey, randomBytes, randomUUID, timingSafeEqual, verify } from "node:crypto";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from "node:fs";

const DIR=join(homedir(),".resume-expert");
const FILE=join(DIR,"siwc-chatgpt.json");
const HOST=join(DIR,"siwc-host-id");
const ISSUER="https://auth.openai.com",RESOURCE="https://api.openai.com/v1";
const SCOPES="openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
function secret(bytes=32){return randomBytes(bytes).toString("base64url");}
function hostId(){
 mkdirSync(DIR,{recursive:true,mode:0o700});
 if(existsSync(HOST))return readFileSync(HOST,"utf8").trim();
 const id="urn:uuid:"+randomUUID();
 writeFileSync(HOST,id,{mode:0o600,flag:"wx"});
 return id;
}
function equal(a,b){
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
async function verifyIdToken(token,clientId,nonce,prior){
 const parts=token.split(".");
 if(parts.length!==3)throw Error("OpenAI ID token 格式无效");
 const header=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
 if(header.alg!=="RS256"||typeof header.kid!=="string")throw Error("ID token 签名算法无效");
 const discovery=await fetch(ISSUER+"/.well-known/openid-configuration",{signal:AbortSignal.timeout(10000)}).then(r=>r.json());
 const jwksUrl=new URL(discovery.jwks_uri);
 if(jwksUrl.origin!==ISSUER||jwksUrl.protocol!=="https:")throw Error("JWKS 来源不可信");
 const keys=await fetch(jwksUrl,{signal:AbortSignal.timeout(10000)}).then(r=>r.json());
 const jwk=keys.keys?.find(k=>k.kid===header.kid&&k.kty==="RSA");
 if(!jwk)throw Error("无法找到 OpenAI ID token 验证密钥");
 if(!verify("RSA-SHA256",Buffer.from(parts[0]+"."+parts[1]),createPublicKey({key:jwk,format:"jwk"}),Buffer.from(parts[2],"base64url")))
   throw Error("ID token 签名不匹配");
 const claims=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8"));
 if(claims.iss!==ISSUER||!(claims.aud===clientId||Array.isArray(claims.aud)&&claims.aud.includes(clientId))||
   !Number.isFinite(claims.exp)||claims.exp<=Date.now()/1000||
   !Number.isFinite(claims.iat)||claims.iat>Date.now()/1000+60||
   !equal(String(claims.nonce||""),nonce)||typeof claims.sub!=="string"||!claims.sub)
   throw Error("ID token 声明验证失败（issuer/audience/expiry/nonce）");
 if(prior&&prior.subject!==claims.sub)throw Error("OAuth 返回的 ChatGPT 账号与此前绑定账号不同");
 return {subject:claims.sub,email:typeof claims.email==="string"?claims.email:undefined};
}
const current=existsSync(FILE)?JSON.parse(readFileSync(FILE,"utf8")):null;
const nonce=secret(),state=secret(),verifier=secret(48);
const challenge=createHash("sha256").update(verifier).digest("base64url");
const host=hostId();
let onCallback;
const result=new Promise((resolve,reject)=>{onCallback={resolve,reject};});
const server=createServer((req,res)=>{
 const target=new URL(req.url||"/","http://127.0.0.1");
 if(target.pathname!=="/auth/callback"){res.writeHead(404).end("Not found");return;}
 const returned=target.searchParams.get("state")||"";
 if(!equal(returned,state)){
   res.writeHead(400,{"Content-Type":"text/plain; charset=utf-8"}).end("OAuth state mismatch");
   return onCallback.reject(Error("OAuth state mismatch"));
 }
 const oauthError=target.searchParams.get("error");
 if(oauthError){
   res.writeHead(400).end("Authorization was declined");
   return onCallback.reject(Error("用户取消授权或账号拒绝："+oauthError));
 }
 res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"})
  .end("<!doctype html><meta charset='utf-8'><title>Resume Expert</title><p>授权返回成功。请回到终端确认最终校验结果。</p>");
 onCallback.resolve(target.searchParams);
});
server.listen(0,"127.0.0.1");
await new Promise(resolve=>server.once("listening",resolve));
const callback="http://127.0.0.1:"+server.address().port+"/auth/callback";
const authorization=new URL(ISSUER+"/api/accounts/authorize");
const fields={
 client_id:current?.client_id||"dynamic_agent_client",response_type:"code",redirect_uri:callback,
 scope:SCOPES,resource:RESOURCE,state,nonce,code_challenge_method:"S256",
 code_challenge:challenge,ext_agent_host_id:host
};
if(!current)fields.agent_name_hint="Resume Expert";
if(current?.id_token)fields.id_token_hint=current.id_token;
for(const [key,value] of Object.entries(fields))authorization.searchParams.set(key,value);
console.log("请在本机浏览器打开此 OpenAI 官方授权地址（无需把它发送给任何人）：");
console.log(authorization.toString());
console.log("等待本机 OAuth 回调，最多 5 分钟...");
let timer;
try{
 const callbackParams=await Promise.race([
   result,
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("OAuth 授权超时")),300000);})
 ]);
 const issued=callbackParams.get("client_id")||current?.client_id;
 if(!/^oaiapp_[\w-]+$/.test(issued||""))throw Error("未获得有效的 OpenAI 颁发的 client_id");
 if(current?.client_id && current.client_id!==issued)throw Error("client_id 在授权过程中发生意外变化");
 const code=callbackParams.get("code");
 if(!code)throw Error("OAuth 回调缺少 authorization code");
 const response=await fetch(ISSUER+"/api/accounts/oauth/token",{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({grant_type:"authorization_code",client_id:issued,
   redirect_uri:callback,code,code_verifier:verifier,resource:RESOURCE}),
  signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error("OAuth code 交换失败，HTTP "+response.status);
 const auth=await response.json();
 if(!auth.id_token||!auth.access_token||!auth.refresh_token ||
   !auth.scope?.split(/\s+/).includes("chatgpt.tokens.use.direct"))
   throw Error("未获得 ChatGPT 订阅额度授权；请确认已单独同意套餐使用权限");
 const identity=await verifyIdToken(auth.id_token,issued,nonce,current);
 const record={issuer:ISSUER,subject:identity.subject,email:identity.email,client_id:issued,
  access_token:auth.access_token,refresh_token:auth.refresh_token,id_token:auth.id_token,
  scope:auth.scope,expires_in:auth.expires_in||3600,saved_at:new Date().toISOString(),ext_agent_host_id:host};
 mkdirSync(DIR,{recursive:true,mode:0o700});
 const tmp=FILE+".tmp-"+randomUUID();
 writeFileSync(tmp,JSON.stringify(record,null,2),{mode:0o600,flag:"wx"});
 chmodSync(tmp,0o600);
 renameSync(tmp,FILE);
 console.log("本机 OAuth 已成功验证并保存。没有输出访问令牌。");
 console.log("下一步按 docs/CHATGPT-SUBSCRIPTION.md 通过 SSH 安全导入 Oracle VPS。");
}finally{
 clearTimeout(timer);
 server.close();
}
