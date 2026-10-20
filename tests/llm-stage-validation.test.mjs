import assert from "node:assert/strict";
import { after,test } from "node:test";
import { registerHooks } from "node:module";
import { mkdtempSync,rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const hooks=registerHooks({resolve(specifier,context,nextResolve){
  return nextResolve(specifier.startsWith("@/")?new URL("../src/"+specifier.slice(2)+".ts",import.meta.url).href:specifier,context);
}});
after(()=>hooks.deregister());
const {runLLMResumeAnalysis}=await import("../src/services/ai/resumeAgent.llm.ts");
const {closeHistoryDb}=await import("../src/lib/history-db.ts");

function stages() {
  return [
    {jdAnalysis:{responsibilities:[],hardRequirements:[],implicitRequirements:[],keywords:[],idealCandidate:"",coreCompetencies:[]}},
    {diagnosis:{overallScore:60,dimensionScores:[],mainIssues:[],prioritySuggestions:[]},
      matchItems:Array.from({length:6},()=>({jdRequirement:"分析",resumeEvidence:"设计报表",evidenceStrength:"medium",needsSupplement:true,optimizationSuggestion:"补充口径"})),
      followUpQuestions:Array.from({length:5},(_,i)=>({id:"fu-"+i,question:"依据是什么",purpose:"核实",userAnswer:"",generatedBullet:""}))},
    {optimizedItems:Array.from({length:5},(_,i)=>({id:"opt-"+i,section:"摘要",before:"原文",after:"建议",reason:"简洁",riskWarning:"待核实"})),
      finalResume:{personalInfo:{name:"合成测试",email:"",phone:"",location:""},jobIntent:"产品经理",summary:"摘要",coreSkills:[],workExperience:[],projectExperience:[],skillsAndTools:[],education:{school:"",degree:"",period:""}}},
    {interviewPrep:{likelyQuestions:Array.from({length:10},()=>({question:"依据是什么",suggestedAnswer:"结合证据",evidenceNeeded:[]})),evidenceToPrepare:[],possibleExaggerations:[],dataToSupplement:[],selfIntroduction:"合成介绍"}},
  ];
}
async function withProvider(responses,check) {
  const dir=mkdtempSync(join(tmpdir(),"resume-llm-stage-"));
  const keys=["RESUME_DATA_DIR","LLM_API_KEY","LLM_BASE_URL","USE_MOCK_AI"];
  const prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  Object.assign(process.env,{RESUME_DATA_DIR:dir,LLM_API_KEY:"synthetic-provider-key",LLM_BASE_URL:"https://synthetic-provider.invalid/v1",USE_MOCK_AI:"false"});
  const original=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async url=>{
    assert.equal(String(url),"https://synthetic-provider.invalid/v1/chat/completions");
    const content=responses[calls++];
    if(content instanceof Response)return content;
    return Response.json({choices:[{message:{content:JSON.stringify(content)}}],usage:{prompt_tokens:10,completion_tokens:10}});
  };
  try {
    await check(()=>runLLMResumeAnalysis({targetRole:"产品经理",industry:"软件",companyType:"中型公司",jobStage:"转行",highlightSkills:"",jobDescription:"合成JD",originalResume:"合成材料",additionalInfo:""}),()=>calls);
  } finally {
    globalThis.fetch=original;closeHistoryDb();
    for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}
    rmSync(dir,{recursive:true,force:true});
  }
}
test("invalid JD stops before subsequent paid inference stages",async()=>{
  const responses=stages();responses[0]={jdAnalysis:{responsibilities:"wrong shape"}};
  await withProvider(responses,async(run,count)=>{
    await assert.rejects(run,/模型返回结构无效：jdAnalysis/);
    assert.equal(count(),1,"Invalid JD must not trigger diagnosis or output requests");
  });
});
test("diagnosis is validated before summary construction and further model calls",async()=>{
  const responses=stages();responses[1]={diagnosis:{overallScore:60,mainIssues:"wrong shape"}};
  await withProvider(responses,async(run,count)=>{
    await assert.rejects(run,/模型返回结构无效：diagnosis/);
    assert.equal(count(),2);
  });
});
test("all four valid inference stages still produce a complete analysis",async()=>{
  await withProvider(stages(),async(run,count)=>{
    const result=await run();
    assert.equal(result.finalResume.summary,"摘要");
    assert.equal(result.interviewPrep.likelyQuestions.length,10);
    assert.equal(count(),4);
  });
});

test("malformed provider JSON never exposes response snippets in public errors",async()=>{
  const marker="FAKE_PII@example.invalid";
  await withProvider([new Response(marker)],async run=>{
    await assert.rejects(run,error=>{
      assert(!error.message.includes("FAKE_PII"));
      assert.match(error.message,/响应格式无效/);
      return true;
    });
  });
});
