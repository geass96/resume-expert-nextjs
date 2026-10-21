import assert from "node:assert/strict";
import { test } from "node:test";
import { useResumeStore } from "../src/store/resume-store.ts";

function result(summary) {
  return {
    jdAnalysis:{responsibilities:[],hardRequirements:[],implicitRequirements:[],keywords:[],idealCandidate:"",coreCompetencies:[]},
    diagnosis:{overallScore:60,dimensionScores:[],mainIssues:[],prioritySuggestions:[]},matchItems:[],
    followUpQuestions:[],optimizedItems:[{id:"same-id",section:"摘要",before:"原文",after:summary,reason:"",riskWarning:""}],
    finalResume:{personalInfo:{name:"合成测试",phone:"",email:"",location:""},jobIntent:"产品经理",summary,
      coreSkills:[],workExperience:[],projectExperience:[],skillsAndTools:[],education:{school:"",degree:"",period:""}},
    interviewPrep:{likelyQuestions:[],evidenceToPrepare:[],possibleExaggerations:[],dataToSupplement:[],selfIntroduction:""},
  };
}

test("reanalysis before first save preserves the latest manual draft, decisions and evidence",()=>{
  const store=useResumeStore.getState();
  store.setAnalysisResult(result("首轮建议"),false);
  store.applyProposal("same-id","summary","已采纳文案");
  store.setEvidenceNote("summary","本人核实说明");
  // An edit made while inference is pending must also survive its completion.
  store.updateDraft("summary","模型等待期间的人工修改");
  const before=structuredClone(useResumeStore.getState().proposalDecisions);
  assert.equal(useResumeStore.getState().parentVersionId,"");
  store.setAnalysisResult(result("再次分析的新建议"));
  const current=useResumeStore.getState();
  assert.equal(current.draftResume.summary,"模型等待期间的人工修改");
  assert.deepEqual(current.proposalDecisions,before);
  assert.notEqual(current.analysisResult.optimizedItems[0].id,"same-id");
  assert.equal(current.analysisResult.finalResume.summary,"再次分析的新建议");
});

test("first analysis initializes a draft and reanalysis preserves saved version ancestry",()=>{
  useResumeStore.setState({draftResume:null,analysisResult:null,proposalDecisions:{},parentVersionId:"",currentProfileId:"",currentJobId:""});
  useResumeStore.getState().setAnalysisResult(result("首次结果"));
  assert.equal(useResumeStore.getState().draftResume.summary,"首次结果");
  useResumeStore.getState().markSaved("version-1","profile-1","job-1");
  useResumeStore.getState().updateDraft("summary","保存后人工修改");
  useResumeStore.getState().setAnalysisResult(result("新分析"));
  assert.equal(useResumeStore.getState().draftResume.summary,"保存后人工修改");
  assert.equal(useResumeStore.getState().parentVersionId,"version-1");
  assert.equal(useResumeStore.getState().currentJobId,"job-1");
});
