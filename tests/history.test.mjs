import assert from "node:assert/strict";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
const dir=mkdtempSync(join(tmpdir(),"resume-expert-test-"));
process.env.RESUME_DATA_DIR=dir;
const {saveVersion,getVersion,listHistory,removeVersion,introductionFor,saveIntroduction,closeHistoryDb}=await import("../src/lib/history-db.ts");
const snapshot=()=>({
 personalInfo:{name:"测试用户",phone:"",email:"",location:""},jobIntent:"AI 产品经理",summary:"最初的摘要",
 coreSkills:["产品规划"],workExperience:[{company:"测试公司",role:"产品经理",period:"2020-2023",bullets:["写需求文档"]}],
 projectExperience:[],skillsAndTools:[],education:{school:"学校",degree:"本科",period:""}
});
try{
 test("separate jobs, immutable versions, compare, restore-as-new, introduction and soft-delete",()=>{
  const a=saveVersion({profileTitle:"主简历",company:"公司A",role:"AI 产品经理",jdText:"JD-A",label:"初始",note:"",snapshot:snapshot(),decisions:{}});
  const changed=snapshot();changed.workExperience[0].bullets[0]="推进 AI 产品上线";
  const b=saveVersion({profileId:a.profileId,jobId:a.jobId,parentVersionId:a.id,profileTitle:"主简历",company:"公司A",role:"AI 产品经理",jdText:"JD-A",label:"人工确认",note:"",snapshot:changed,decisions:{p1:{decision:"accepted"}}});
  assert.equal(a.versionNo,1);assert.equal(b.versionNo,2);
  assert.equal(getVersion(a.id).snapshot.workExperience[0].bullets[0],"写需求文档");
  assert.equal(getVersion(b.id).snapshot.workExperience[0].bullets[0],"推进 AI 产品上线");
  assert.notEqual(getVersion(a.id).contentHash,getVersion(b.id).contentHash);
  const other=saveVersion({profileId:a.profileId,profileTitle:"主简历",company:"公司B",role:"项目经理",jdText:"JD-B",label:"其他岗位",note:"",snapshot:snapshot(),decisions:{}});
  assert.notEqual(other.jobId,a.jobId);
  assert.throws(()=>saveVersion({profileId:a.profileId,jobId:other.jobId,parentVersionId:a.id,profileTitle:"主简历",company:"公司B",role:"项目经理",jdText:"JD-B",label:"错误",note:"",snapshot:snapshot(),decisions:{}}),/父版本/);
  const restored=saveVersion({profileId:a.profileId,jobId:a.jobId,parentVersionId:a.id,profileTitle:"主简历",company:"公司A",role:"AI 产品经理",jdText:"JD-A",label:"恢复旧版",note:"",snapshot:getVersion(a.id).snapshot,decisions:{}});
  assert.equal(restored.versionNo,3);assert.equal(listHistory().length,4);
  saveIntroduction(b.id,1,"一分钟介绍","manual");
  assert.equal(introductionFor(b.id,1).content,"一分钟介绍");
  assert.equal(removeVersion(a.id),true);assert.equal(getVersion(a.id),null);assert.equal(listHistory().length,3);
 });
} finally { closeHistoryDb(); rmSync(dir,{recursive:true,force:true}); }
