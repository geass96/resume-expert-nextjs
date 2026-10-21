import assert from "node:assert/strict";
import { test } from "node:test";
import { useResumeStore } from "../src/store/resume-store.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const snapshot = {
  personalInfo: { name: "回归测试", phone: "", email: "", location: "" },
  jobIntent: "产品经理", summary: "人工确认的摘要", coreSkills: [],
  workExperience: [], projectExperience: [], skillsAndTools: [],
  education: { school: "测试学校", degree: "本科", period: "2020" },
};

test("restoring a legacy history version leaves all five workflow steps accessible", () => {
  useResumeStore.getState().restoreVersion(snapshot, "version-1", "profile-1", "job-1", "产品经理");
  for (const step of ["jd-analysis", "diagnosis", "match", "follow-up", "optimize"]) {
    assert.notEqual(useResumeStore.getState().getStepStatus(step), "disabled", `${step} is disabled after restore`);
  }
});

test("legacy restore replaces unrelated inputs and preserves edits when analysis is rebuilt", () => {
  useResumeStore.getState().setUserInput({jobDescription:"其他岗位JD", additionalInfo:"其他人的补充信息"});
  useResumeStore.getState().restoreVersion(snapshot,"legacy","profile","job","产品经理",{
    jobDescription:"历史岗位JD",decisions:{"opt-1":{decision:"rejected",fieldPath:"summary",text:"",at:"2026-01-01T00:00:00Z"}},
  });
  assert.equal(useResumeStore.getState().userInput.jobDescription,"历史岗位JD");
  assert.equal(useResumeStore.getState().userInput.additionalInfo,"");
  assert.match(useResumeStore.getState().userInput.originalResume,/人工确认的摘要/);
  useResumeStore.getState().updateDraft("summary","恢复后人工编辑");
  useResumeStore.getState().setEvidenceNote("summary","已核实");
  useResumeStore.getState().setAnalysisResult(analysis(),true);
  assert.equal(useResumeStore.getState().draftResume.summary,"恢复后人工编辑");
  assert.equal(useResumeStore.getState().parentVersionId,"legacy");
  assert.equal(useResumeStore.getState().currentJobId,"job");
  assert.equal(useResumeStore.getState().proposalDecisions["evidence:summary"].text,"已核实");
  assert.equal(useResumeStore.getState().proposalDecisions["opt-1"].decision,"rejected");
  assert.equal(useResumeStore.getState().proposalDecisions[useResumeStore.getState().analysisResult.optimizedItems[0].id],undefined,"New proposals must not inherit stale decisions with reused model IDs");
});

function analysis() {
  return {
    jdAnalysis:{responsibilities:["产品规划"],hardRequirements:[],implicitRequirements:[],keywords:["产品"],idealCandidate:"测试",coreCompetencies:[]},
    diagnosis:{overallScore:60,dimensionScores:[],mainIssues:[],prioritySuggestions:[]},matchItems:[],
    followUpQuestions:[{id:"follow-1",question:"项目职责？",purpose:"核实",userAnswer:"本人负责需求",generatedBullet:"负责需求分析"}],
    optimizedItems:[{id:"opt-1",section:"职业摘要",before:"旧摘要",after:"优化摘要",reason:"简洁",riskWarning:""}],
    finalResume:structuredClone(snapshot),
    interviewPrep:{likelyQuestions:[],evidenceToPrepare:[],possibleExaggerations:[],dataToSupplement:[],selfIntroduction:"测试介绍"},
  };
}

test("migrates old DB and round-trips complete workflow, answers, decisions and immutable versions", async () => {
  const dir=mkdtempSync(join(tmpdir(),"resume-workflow-"));
  process.env.RESUME_DATA_DIR=dir;
  // Existing installations have this schema and no workflow_json column.
  const oldDb=new DatabaseSync(join(dir,"resume-expert.sqlite"));
  oldDb.exec("CREATE TABLE resume_versions(id TEXT PRIMARY KEY,job_id TEXT NOT NULL,version_no INTEGER NOT NULL,parent_version_id TEXT,snapshot_json TEXT NOT NULL,decisions_json TEXT NOT NULL,content_hash TEXT NOT NULL,label TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL,deleted_at TEXT,UNIQUE(job_id,version_no))");
  oldDb.close();
  const db=await import("../src/lib/history-db.ts");
  try {
    const payload={profileTitle:"测试主简历",company:"测试公司",role:"产品经理",jdText:"旧JD",label:"旧版",note:"",snapshot,decisions:{}};
    const legacy=db.saveVersion(payload);
    assert.equal(db.getVersion(legacy.id).workflow,null);
    assert.equal(db.getVersion(legacy.id).jobDescription,"旧JD");
    const userInput={targetRole:"产品经理",industry:"软件",companyType:"中型公司",jobStage:"转行",highlightSkills:"需求分析",jobDescription:"此版本的新JD",originalResume:"真实原始材料",additionalInfo:"补充事实"};
    const decisions={"opt-1":{decision:"edited",fieldPath:"summary",text:"人工摘要",at:"2026-01-01T00:00:00Z"}};
    const workflow={userInput,analysisResult:analysis(),optimizeStyle:"concise"};
    const saved=db.saveVersion({...payload,profileId:legacy.profileId,jobId:legacy.jobId,parentVersionId:legacy.id,workflow,decisions});
    db.closeHistoryDb(); // Exercise persistence across a new connection, not an in-memory snapshot.
    const restored=db.getVersion(saved.id);
    assert.deepEqual(restored.workflow,workflow);
    useResumeStore.getState().restoreVersion(restored.snapshot,restored.id,restored.profileId,restored.jobId,restored.role,restored);
    assert.deepEqual(useResumeStore.getState().userInput,userInput);
    assert.deepEqual(useResumeStore.getState().proposalDecisions,decisions);
    assert.equal(useResumeStore.getState().optimizeStyle,"concise");
    assert.equal(useResumeStore.getState().analysisResult.diagnosis.overallScore,60);
    useResumeStore.getState().updateFollowUpAnswer("follow-1","恢复后补充的答案");
    useResumeStore.getState().setFollowUpBullet("follow-1","恢复后生成的条目");
    useResumeStore.getState().applyProposal("opt-1","summary","采纳新建议");
    const state=useResumeStore.getState();
    const next=db.saveVersion({...payload,profileId:saved.profileId,jobId:saved.jobId,parentVersionId:saved.id,
      snapshot:state.draftResume,decisions:state.proposalDecisions,
      workflow:{userInput:state.userInput,analysisResult:state.analysisResult,optimizeStyle:state.optimizeStyle}});
    assert.equal(db.getVersion(next.id).workflow.analysisResult.followUpQuestions[0].userAnswer,"恢复后补充的答案");
    assert.equal(db.getVersion(next.id).snapshot.summary,"采纳新建议");
    assert.equal(db.getVersion(next.id).parentVersionId,saved.id);
    assert.equal(db.getVersion(saved.id).workflow.analysisResult.followUpQuestions[0].userAnswer,"本人负责需求");
    assert.equal(db.getVersion(saved.id).snapshot.summary,snapshot.summary);
    assert.equal(restored.workflow.analysisResult.followUpQuestions[0].userAnswer,"本人负责需求");
    assert.throws(()=>db.saveVersion({...payload,workflow:{...workflow,analysisResult:{}}}),/分析结果结构/);
    assert.throws(()=>db.saveVersion({...payload,workflow:{...workflow,userInput:{}}}),/输入材料/);
    assert.throws(()=>db.saveVersion({...payload,workflow:{...workflow,userInput:{...userInput,originalResume:"x".repeat(240001)}}}),/大小限制/);
  } finally {
    db.closeHistoryDb();
    rmSync(dir,{recursive:true,force:true});
  }
});
