import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeHistoryDb } from "../src/lib/history-db.ts";
import { SIWC_SCOPE,saveSubscription,selectSubscription,subscriptionAccessToken,subscriptionStatus,disconnectSubscription } from "../src/lib/chatgpt-subscription.ts";

function credential(subject="synthetic-old") {
  return {issuer:"https://auth.openai.com",subject,client_id:"oaiapp_testingclient",
    access_token:subject+"-access",refresh_token:subject+"-refresh",id_token:"fake.test.jwt",
    scope:"openid offline_access "+SIWC_SCOPE,expires_in:3600,saved_at:new Date().toISOString(),ext_agent_host_id:"urn:uuid:test"};
}
function deferred() {
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}
function refreshed(subject="synthetic-old") {
  return Response.json({access_token:subject+"-new-access",refresh_token:subject+"-new-refresh",expires_in:3600});
}
async function isolated(run) {
  const dir=mkdtempSync(join(tmpdir(),"resume-subscription-lifecycle-"));
  const originalFetch=globalThis.fetch;
  process.env.RESUME_DATA_DIR=dir;
  process.env.RESUME_MODEL_ENCRYPTION_KEY="synthetic-lifecycle-key-material-for-testing-only-123";
  try {saveSubscription(credential());selectSubscription("synthetic-model");await run();}
  finally {globalThis.fetch=originalFetch;closeHistoryDb();delete process.env.RESUME_DATA_DIR;delete process.env.RESUME_MODEL_ENCRYPTION_KEY;rmSync(dir,{force:true,recursive:true});}
}
function revocation(url) {
  if(String(url).includes(".well-known"))return Response.json({revocation_endpoint:"https://auth.openai.com/oauth/revoke"});
  return new Response("",{status:200});
}

test("an in-flight refresh cannot recreate credentials after disconnect", async () => isolated(async () => {
  const response=deferred();
  globalThis.fetch=async url=>String(url).includes("/oauth/token")?response.promise:revocation(url);
  const refresh=subscriptionAccessToken(true);
  const result=refresh.then(()=>"resolved",()=>"rejected");
  assert.deepEqual(await disconnectSubscription(),{revoked:true});
  assert.equal(subscriptionStatus().connected,false);
  response.resolve(refreshed());
  assert.equal(await result,"rejected");
  assert.equal(subscriptionStatus().connected,false);
}));

test("a new account refresh is independent of an older account's pending refresh", async () => isolated(async () => {
  const oldResponse=deferred();
  let calls=0;
  globalThis.fetch=async (_url,options)=>{
    calls++;
    return String(options.body).includes("synthetic-new-refresh")?refreshed("synthetic-new"):oldResponse.promise;
  };
  const old=subscriptionAccessToken(true).then(()=>"resolved",()=>"rejected");
  saveSubscription(credential("synthetic-new"));
  const fresh=subscriptionAccessToken(true);
  // Resolve both responses before awaiting so a broken shared lock cannot hang the test.
  oldResponse.resolve(refreshed());
  assert.equal(await fresh,"synthetic-new-new-access");
  assert.equal(await old,"rejected");
  assert.equal(calls,2);
  assert.equal(await subscriptionAccessToken(),"synthetic-new-new-access");
}));

test("disconnect revocation must not delete a newly imported account", async () => isolated(async () => {
  const metadata=deferred();
  globalThis.fetch=async url=>String(url).includes(".well-known")?metadata.promise:revocation(url);
  const disconnect=disconnectSubscription();
  saveSubscription(credential("synthetic-new"));
  selectSubscription("synthetic-new-model");
  metadata.resolve(Response.json({revocation_endpoint:"https://auth.openai.com/oauth/revoke"}));
  await disconnect;
  assert.equal(subscriptionStatus().connected,true);
  assert.equal(subscriptionStatus().model,"synthetic-new-model");
  assert.equal(await subscriptionAccessToken(),"synthetic-new-access");
}));

test("changing the selected model while refreshing keeps the new selection", async () => isolated(async () => {
  const response=deferred();
  globalThis.fetch=async ()=>response.promise;
  const refresh=subscriptionAccessToken(true);
  selectSubscription("synthetic-new-model");
  response.resolve(refreshed());
  assert.equal(await refresh,"synthetic-old-new-access");
  assert.equal(subscriptionStatus().model,"synthetic-new-model");
}));
