import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
test("provider credentials are encrypted, never returned, selected and removed",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"resume-model-test-"));
  process.env.RESUME_DATA_DIR=dir;
  process.env.RESUME_SESSION_SECRET="TEST_NON_PRODUCTION_TEST_SESSION_SECRET_01234567890123456789";
  const {closeHistoryDb}=await import("../src/lib/history-db.ts");
  const {saveModelSettings,listModelSettings,activeModelCredentials,setActiveModel,deleteModelSettings,MODEL_PROVIDER_PRESETS}=await import("../src/lib/model-settings.ts");
  try{
    const secret="test-only-token-should-not-appear-in-sqlite";
    const id=saveModelSettings({provider:"deepseek",model:"deepseek-flash",apiKey:secret});
    const list=listModelSettings();
    assert.equal(list.profiles.length,1);
    assert.equal(list.profiles[0].hasKey,true);
    assert.equal(JSON.stringify(list).includes(secret),false);
    setActiveModel(id);
    assert.equal(activeModelCredentials().apiKey,secret);
    assert.equal(activeModelCredentials().baseUrl,MODEL_PROVIDER_PRESETS.deepseek.baseUrl);
    const db=readFileSync(join(dir,"resume-expert.sqlite"));
    assert.equal(db.toString().includes(secret),false);
    assert.throws(()=>saveModelSettings({provider:"http://127.0.0.1",model:"foo",apiKey:secret}));
    assert.throws(()=>saveModelSettings({provider:"__proto__",model:"foo",apiKey:secret}));
    assert.throws(()=>saveModelSettings({id,provider:"qoder",model:"auto"}),/重新填写/);
    setActiveModel(null);
    assert.equal(activeModelCredentials().mode,"mock");
    assert.equal(deleteModelSettings(id),true);
    assert.equal(listModelSettings().profiles.length,0);
  }finally{closeHistoryDb();rmSync(dir,{recursive:true,force:true});}
});

test("Qoder PAT profiles preserve explicit selection, allow model changes and erase deleted credentials",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"resume-qoder-settings-"));
  process.env.RESUME_DATA_DIR=dir;
  process.env.RESUME_SESSION_SECRET="TEST_NON_PRODUCTION_TEST_SESSION_SECRET_01234567890123456789";
  const {closeHistoryDb}=await import("../src/lib/history-db.ts");
  const {saveModelSettings,listModelSettings,activeModelCredentials,setActiveModel,deleteModelSettings,credentialsForModel}=await import("../src/lib/model-settings.ts");
  try{
    setActiveModel(null);
    const key="synthetic-qoder-only-never-real-token";
    const id=saveModelSettings({provider:"qoder",model:"auto",apiKey:key});
    assert.equal(activeModelCredentials().mode,"mock");
    assert.equal(JSON.stringify(listModelSettings()).includes(key),false);
    assert.equal(readFileSync(join(dir,"resume-expert.sqlite")).includes(Buffer.from(key)),false);
    setActiveModel(id);
    assert.equal(activeModelCredentials().provider,"qoder");
    saveModelSettings({id,provider:"qoder",model:"my-account-model"});
    assert.equal(activeModelCredentials().model,"my-account-model");
    assert.equal(credentialsForModel(id).apiKey,key);
    deleteModelSettings(id);
    assert.equal(activeModelCredentials().mode,"mock");
    assert.throws(()=>credentialsForModel(id));
  }finally{closeHistoryDb();rmSync(dir,{recursive:true,force:true});}
});
