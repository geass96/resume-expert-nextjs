import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync,rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { closeHistoryDb } from "../src/lib/history-db.ts";
import {
 SIWC_SCOPE,getOrCreateHostId,saveSubscription,subscriptionStatus,selectSubscription,
 selectedSubscription,subscriptionAccessToken,disconnectSubscription
} from "../src/lib/chatgpt-subscription.ts";
import { readSubscriptionEvents } from "../src/lib/ai/chatgpt-siwc.ts";

test("SIWC SSE: fragmented JSON events require response.completed",()=>{
 const message='{"success":true}';
 const data="data: "+JSON.stringify({type:"response.output_text.delta",delta:message})+"\n\n";
 const done="data: "+JSON.stringify({type:"response.completed"})+"\n\n";
 assert.equal(readSubscriptionEvents([data.slice(0,12),data.slice(12),done]),message);
 assert.throws(()=>readSubscriptionEvents([data]),/完成标志/);
 assert.throws(()=>readSubscriptionEvents([
  "data: "+JSON.stringify({type:"response.failed"})+"\n\n"
 ]),/未成功完成/);
});
test("SIWC encrypted storage, stable host ID, refresh locking and disconnect",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"siwc-qa-"));
 process.env.RESUME_DATA_DIR=dir;
 process.env.RESUME_MODEL_ENCRYPTION_KEY="siwc-test-only-encryption-key-material-exclusively-for-tests-123";
 const fetchOriginal=globalThis.fetch;
 try {
   const first=subscriptionStatus();
   assert.equal(first.connected,false);
   assert.equal(first.active,false);
   assert.match(first.hostId,/^urn:uuid:/);
   assert.equal(first.hostId,getOrCreateHostId());
   const record={
     issuer:"https://auth.openai.com",subject:"synthetic-subject",client_id:"oaiapp_testingclient",
     access_token:"secret-access-original",refresh_token:"secret-refresh-original",id_token:"fake.test.jwt",
     scope:"openid offline_access "+SIWC_SCOPE,expires_in:3600,
     saved_at:new Date().toISOString(),ext_agent_host_id:"urn:uuid:original-laptop-host"
   };
   assert.throws(()=>saveSubscription({...record,scope:"openid offline_access"}),/订阅使用许可/);
   saveSubscription(record);
   assert.equal(subscriptionStatus().connected,true);
   assert.equal(subscriptionStatus().active,false);
   assert.equal(selectedSubscription(),null);
   selectSubscription("gpt-6.1-sol");
   assert.equal(selectedSubscription()?.model,"gpt-6.1-sol");
   assert.equal(subscriptionStatus().active,true);
   assert.equal(await subscriptionAccessToken(),"secret-access-original");
   const db=new DatabaseSync(join(dir,"resume-expert.sqlite"));
   const enc=db.prepare("SELECT encrypted_json FROM chatgpt_subscription WHERE singleton=1").get().encrypted_json;
   assert(!enc.includes("secret-access-original")&&!enc.includes("secret-refresh-original"));
   const host=db.prepare("SELECT host_id FROM chatgpt_host WHERE singleton=1").get().host_id;
   assert.equal(host,first.hostId);
   db.close();
   let renewCalls=0;
   globalThis.fetch=async (url,options)=>{
     const uri=String(url);
     if(uri.includes("/api/accounts/oauth/token")){
       renewCalls++;
       assert.equal(options.method,"POST");
       assert.match(String(options.body),/grant_type=refresh_token/);
       return new Response(JSON.stringify({
         access_token:"secret-access-refreshed",refresh_token:"secret-refresh-refreshed",
         expires_in:3600
       }),{status:200,headers:{"Content-Type":"application/json"}});
     }
     if(uri.includes(".well-known/openid-configuration")){
       return new Response(JSON.stringify({revocation_endpoint:"https://auth.openai.com/oauth/revoke"}),{status:200});
     }
     if(uri.endsWith("/oauth/revoke")){
       assert.match(String(options.body),/token=secret-refresh-refreshed/);
       return new Response("",{status:200});
     }
     throw Error("Unexpected request "+uri);
   };
   const tokens=await Promise.all([subscriptionAccessToken(true),subscriptionAccessToken(true)]);
   assert.deepEqual(tokens,["secret-access-refreshed","secret-access-refreshed"]);
   assert.equal(renewCalls,1);
   assert.equal(await subscriptionAccessToken(),"secret-access-refreshed");
   assert.deepEqual(await disconnectSubscription(),{revoked:true});
   assert.equal(subscriptionStatus().connected,false);
   assert.equal(subscriptionStatus().active,false);
 }finally {
   globalThis.fetch=fetchOriginal;
   closeHistoryDb();
   rmSync(dir,{force:true,recursive:true});
   delete process.env.RESUME_DATA_DIR;
   delete process.env.RESUME_MODEL_ENCRYPTION_KEY;
 }
});
