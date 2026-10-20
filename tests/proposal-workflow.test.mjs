import assert from "node:assert/strict";
import { test } from "node:test";
import { useResumeStore } from "../src/store/resume-store.ts";
import { formatResumeAsText } from "../src/lib/utils.ts";

function analysis() {
  return {
    jdAnalysis:{responsibilities:[],hardRequirements:[],implicitRequirements:[],keywords:[],idealCandidate:"",coreCompetencies:[]},
    diagnosis:{overallScore:60,dimensionScores:[],mainIssues:[],prioritySuggestions:[]},matchItems:[],
    followUpQuestions:[{id:"follow-1",question:"项目职责",purpose:"核实",userAnswer:"本人负责",generatedBullet:"完成用户验证"}],
    optimizedItems:[{id:"opt-1",section:"职业摘要",before:"原始摘要",after:"AI 建议摘要",reason:"简洁",riskWarning:"待核实"}],
    finalResume:{personalInfo:{name:"合成测试",phone:"",email:"",location:""},jobIntent:"产品经理",
      summary:"AI 建议摘要",coreSkills:[],workExperience:[{company:"合成公司",role:"产品经理",period:"2024",bullets:["原始条目"]}],
      projectExperience:[],skillsAndTools:[],education:{school:"",degree:"",period:""}},
    interviewPrep:{likelyQuestions:[],evidenceToPrepare:[],possibleExaggerations:[],dataToSupplement:[],selfIntroduction:""},
  };
}

test("rejecting an initial AI suggestion removes it from the exported draft at the chosen field", () => {
  useResumeStore.getState().setAnalysisResult(analysis());
  useResumeStore.getState().rejectProposal("opt-1", "summary");
  const state=useResumeStore.getState();
  assert.equal(state.draftResume.summary,"原始摘要");
  assert(!formatResumeAsText(state.draftResume).includes("AI 建议摘要"));
  assert.equal(state.proposalDecisions["opt-1"].decision,"rejected");
  assert.equal(state.proposalDecisions["opt-1"].fieldPath,"summary");
});

test("rejection requires an explicit target and never guesses which matching text to change", () => {
  const result=analysis();
  result.finalResume.workExperience[0].bullets[0]="AI 建议摘要";
  useResumeStore.getState().setAnalysisResult(result);
  assert.equal(useResumeStore.getState().rejectProposal("opt-1"),false);
  assert.equal(useResumeStore.getState().proposalDecisions["opt-1"],undefined);
  useResumeStore.getState().rejectProposal("opt-1","summary");
  assert.equal(useResumeStore.getState().draftResume.workExperience[0].bullets[0],"AI 建议摘要");
});

test("accept then reject restores the previous text, while later manual edits survive rejection", () => {
  const result=analysis();
  result.finalResume.summary="已有人工摘要";
  useResumeStore.getState().setAnalysisResult(result);
  useResumeStore.getState().applyProposal("opt-1","summary","AI 建议摘要");
  useResumeStore.getState().rejectProposal("opt-1","summary");
  assert.equal(useResumeStore.getState().draftResume.summary,"已有人工摘要");
  useResumeStore.getState().applyProposal("opt-1","summary","AI 建议摘要");
  useResumeStore.getState().updateDraft("summary","采纳后再次人工编辑");
  useResumeStore.getState().rejectProposal("opt-1","summary");
  assert.equal(useResumeStore.getState().draftResume.summary,"采纳后再次人工编辑");
});

test("a mismatching target is a conflict rather than a false rejected state", () => {
  const result=analysis();
  result.finalResume.summary="其他内容与 AI 建议摘要 的组合";
  useResumeStore.getState().setAnalysisResult(result);
  assert.equal(useResumeStore.getState().rejectProposal("opt-1","summary"),false);
  assert.equal(useResumeStore.getState().proposalDecisions["opt-1"],undefined);
  assert.equal(useResumeStore.getState().draftResume.summary,result.finalResume.summary);
});

test("overlapping proposals must be rejected in reverse order instead of silently restoring rejected text",()=>{
  const result=analysis();
  result.finalResume.summary="原始摘要";
  result.optimizedItems.push({...result.optimizedItems[0],id:"opt-2",before:"AI 建议摘要",after:"第二条建议"});
  useResumeStore.getState().setAnalysisResult(result);
  useResumeStore.getState().applyProposal("opt-1","summary","AI 建议摘要");
  useResumeStore.getState().applyProposal("opt-2","summary","第二条建议");
  assert.equal(useResumeStore.getState().rejectProposal("opt-1","summary"),false,"A newer accepted change is a visible conflict");
  assert.equal(useResumeStore.getState().proposalDecisions["opt-1"].decision,"accepted");
  assert.equal(useResumeStore.getState().draftResume.summary,"第二条建议");
  assert.equal(useResumeStore.getState().rejectProposal("opt-2","summary"),true);
  assert.equal(useResumeStore.getState().rejectProposal("opt-1","summary"),true);
  assert.equal(useResumeStore.getState().draftResume.summary,"原始摘要");
  assert.equal(useResumeStore.getState().proposalDecisions["opt-1"].decision,"rejected");
  assert.equal(useResumeStore.getState().proposalDecisions["opt-2"].decision,"rejected");
});

test("legacy rejected predecessors cause a conflict rather than reappearing on export",()=>{
  const result=analysis();
  result.optimizedItems.push({...result.optimizedItems[0],id:"opt-2",before:"AI 建议摘要",after:"第二条建议"});
  useResumeStore.getState().setAnalysisResult(result);
  useResumeStore.getState().applyProposal("opt-1","summary","AI 建议摘要");
  useResumeStore.getState().applyProposal("opt-2","summary","第二条建议");
  useResumeStore.setState({proposalDecisions:{...useResumeStore.getState().proposalDecisions,
    "opt-1":{decision:"rejected",fieldPath:"summary",text:"",at:"2020-01-01T00:00:00Z"}}});
  assert.equal(useResumeStore.getState().rejectProposal("opt-2","summary"),false);
  assert.equal(useResumeStore.getState().proposalDecisions["opt-2"].decision,"accepted");
  assert.equal(useResumeStore.getState().draftResume.summary,"第二条建议");
});

test("undoing three stacked suggestions restores predecessor ownership at every step",()=>{
  const result=analysis();result.finalResume.summary="原始摘要";
  result.optimizedItems.push({...result.optimizedItems[0],id:"opt-2",before:"AI 建议摘要",after:"第二条建议"},
    {...result.optimizedItems[0],id:"opt-3",before:"第二条建议",after:"第三条建议"});
  useResumeStore.getState().setAnalysisResult(result);
  useResumeStore.getState().applyProposal("opt-1","summary","AI 建议摘要");
  useResumeStore.getState().applyProposal("opt-2","summary","第二条建议");
  useResumeStore.getState().applyProposal("opt-3","summary","第三条建议");
  assert.equal(useResumeStore.getState().rejectProposal("opt-3","summary"),true);
  assert.equal(useResumeStore.getState().draftResume.summary,"第二条建议");
  assert.equal(useResumeStore.getState().proposalDecisions["opt-2"].applied,true);
  assert.equal(useResumeStore.getState().rejectProposal("opt-1","summary"),false);
  assert.equal(useResumeStore.getState().rejectProposal("opt-2","summary"),true);
  assert.equal(useResumeStore.getState().rejectProposal("opt-1","summary"),true);
  assert.equal(useResumeStore.getState().draftResume.summary,"原始摘要");
});

test("reaccepting after manual editing starts a new undo baseline",()=>{
  useResumeStore.getState().setAnalysisResult(analysis());
  useResumeStore.getState().applyProposal("opt-1","summary","AI 建议摘要");
  useResumeStore.getState().updateDraft("summary","新的人工摘要");
  useResumeStore.getState().applyProposal("opt-1","summary","AI 建议摘要");
  useResumeStore.getState().rejectProposal("opt-1","summary");
  assert.equal(useResumeStore.getState().draftResume.summary,"新的人工摘要");
});

test("style regeneration retains evidence and adoption history without inheriting reused AI IDs", () => {
  useResumeStore.getState().setAnalysisResult(analysis());
  useResumeStore.getState().setEvidenceNote("summary","已核实的来源与口径");
  useResumeStore.getState().applyProposal("opt-1","summary","AI 建议摘要");
  useResumeStore.getState().addBullet("follow-1","work:0","完成用户验证");
  const decisions=structuredClone(useResumeStore.getState().proposalDecisions);
  useResumeStore.getState().setOptimizedItems([{...analysis().optimizedItems[0],after:"新风格建议"}]);
  const state=useResumeStore.getState();
  assert.deepEqual(state.proposalDecisions,decisions);
  assert.notEqual(state.analysisResult.optimizedItems[0].id,"opt-1");
  assert.equal(state.proposalDecisions[state.analysisResult.optimizedItems[0].id],undefined);
  useResumeStore.getState().addBullet("follow-1","work:0","完成用户验证");
  useResumeStore.getState().addBullet("follow-duplicate","work:0","完成用户验证");
  assert.deepEqual(useResumeStore.getState().draftResume.workExperience[0].bullets,["原始条目","完成用户验证"]);
});

test("skills and core-capability suggestions have explicit editable rejection targets",()=>{
  const result=analysis();
  result.finalResume.skillsAndTools=["SQL","AI工具"];
  result.finalResume.coreSkills=["需求分析","未经确认的技能"];
  result.optimizedItems.push({id:"skills",section:"技能工具",before:"SQL",after:"SQL、AI工具",reason:"",riskWarning:""},
    {id:"core",section:"核心能力",before:"需求分析",after:"需求分析、未经确认的技能",reason:"",riskWarning:""});
  useResumeStore.getState().setAnalysisResult(result);
  assert.equal(useResumeStore.getState().rejectProposal("skills","skillsAndTools"),true);
  assert.equal(useResumeStore.getState().rejectProposal("core","coreSkills"),true);
  assert.deepEqual(useResumeStore.getState().draftResume.skillsAndTools,["SQL"]);
  assert.deepEqual(useResumeStore.getState().draftResume.coreSkills,["需求分析"]);
  useResumeStore.getState().updateDraft("skillsAndTools","SQL、Figma\n数据分析");
  assert.deepEqual(useResumeStore.getState().draftResume.skillsAndTools,["SQL","Figma","数据分析"]);
});
