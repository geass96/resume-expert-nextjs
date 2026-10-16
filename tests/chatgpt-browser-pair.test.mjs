import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPairSync,sign } from "node:crypto";
import { mkdtempSync,rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("browser pairing accepts only authentic OpenAI credentials, expires, and is single-use",async()=>{
 const path=mkdtempSync(join(tmpdir(),"siwc-browser-pair-"));
 process.env.RESUME_DATA_DIR=path;
 process.env.RESUME_MODEL_ENCRYPTION_KEY="private-fixture-only-please-do-not-use-in-production-123456";
 const realFetch=globalThis.fetch;
 const {closeHistoryDb}=await import("../src/lib/history-db.ts");
 const {createBrowserPair,pairIsValid,completeBrowserPair}=await import("../src/lib/chatgpt-browser-pair.ts");
 const {subscriptionStatus}=await import("../src/lib/chatgpt-subscription.ts");
 const keyPair=generateKeyPairSync("rsa",{modulusLength:2048});
 const jwk=keyPair.publicKey.export({format:"jwk"});
 const kid="synthetic-rsa-key";
 function record(){
  const header=Buffer.from(JSON.stringify({alg:"RS256",kid})).toString("base64url");
  const issued=Math.floor(Date.now()/1000);
  const payload=Buffer.from(JSON.stringify({
    iss:"https://auth.openai.com",aud:"oaiapp_browserfixture",
    sub:"synthetic-user",iat:issued,exp:issued+3500
  })).toString("base64url");
  const sig=sign("RSA-SHA256",Buffer.from(header+"."+payload),keyPair.privateKey).toString("base64url");
  return {issuer:"https://auth.openai.com",subject:"synthetic-user",
    client_id:"oaiapp_browserfixture",access_token:"synthetic-access-token",
    refresh_token:"synthetic-refresh-token",id_token:header+"."+payload+"."+sig,
    scope:"openid offline_access chatgpt.tokens.use.direct",expires_in:3500,
    saved_at:new Date().toISOString(),ext_agent_host_id:"urn:uuid:fake-laptop"};
 }
 try{
  globalThis.fetch=async (url)=>{
   if(String(url).endsWith("/.well-known/openid-configuration"))
     return new Response(JSON.stringify({issuer:"https://auth.openai.com",jwks_uri:"https://auth.openai.com/.well-known/jwks.json"}),{status:200});
   if(String(url).endsWith("/.well-known/jwks.json"))
     return new Response(JSON.stringify({keys:[{...jwk,use:"sig",kid}]}),{status:200});
   throw Error("unexpected external network request");
  };
  const first=createBrowserPair();
  assert.equal(pairIsValid(first.token),true);
  const second=createBrowserPair();
  assert.equal(pairIsValid(first.token),false);
  assert.equal(pairIsValid(second.token),true);
  await assert.rejects(()=>completeBrowserPair(second.token,{...record(),scope:"openid"}));
  assert.equal(subscriptionStatus().connected,false);
  assert.equal(pairIsValid(second.token),true);
  await assert.rejects(()=>completeBrowserPair(second.token,{...record(),subject:"wrong"}));
  await completeBrowserPair(second.token,record());
  assert.equal(subscriptionStatus().connected,true);
  assert.equal(subscriptionStatus().active,false);
  assert.equal(pairIsValid(second.token),false);
  await assert.rejects(()=>completeBrowserPair(second.token,record()));
 }finally{
  globalThis.fetch=realFetch;closeHistoryDb();rmSync(path,{recursive:true,force:true});
  delete process.env.RESUME_DATA_DIR;delete process.env.RESUME_MODEL_ENCRYPTION_KEY;
 }
});
