import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { firstQuestion,mockRound,normalizeFeedback,INTERVIEW_MAX_ROUNDS } from "../src/lib/interview-engine.ts";

const example = {
 personalInfo:{name:"Example User",email:"",phone:"",location:""},
 jobIntent:"Product Manager",summary:"B2B product management",
 coreSkills:[],workExperience:[{company:"Example Co",role:"PM",period:"2020-2024",bullets:["Data dashboard"]}],
 projectExperience:[{name:"Inventory forecast",role:"Lead",period:"2024",bullets:["Prototype"]}],
 skillsAndTools:[],education:{school:"",degree:"",period:""}
};
test("questions reference the selected version and target JD",()=>{
 const project=firstQuestion("AI PM","project",example,"LLM systems");
 const jd=firstQuestion("AI PM","product",example,"model evaluation");
 assert(project.includes("Inventory forecast"));
 assert(jd.includes("model evaluation"));
});
test("mock follow-up is answer-dependent, ends at maximum rounds and labeled mock",()=>{
 const a=mockRound("first answer with identifier ALPHA 123","project",example,"AI PM",1);
 const b=mockRound("second answer with identifier BRAVO 123","project",example,"AI PM",1);
 assert.notEqual(a.nextQuestion,b.nextQuestion);
 assert.equal(a.feedback.source,"mock");
 assert.equal(mockRound("Last answer","hr",example,"AI PM",INTERVIEW_MAX_ROUNDS).nextQuestion,"");
 const bounded=normalizeFeedback({dimensions:{authenticity:999,relevance:-4,star:3.1,clarity:4,evidence:5},strengths:["ok"]},"llm");
 assert.equal(bounded.dimensions.authenticity,5);
 assert.equal(bounded.dimensions.relevance,0);
 assert.equal(bounded.overall,68);
});
test("SQLite sessions: status, version isolation, duplicate turns and replay",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"resume-interview-"));
 process.env.RESUME_DATA_DIR=dir;
 const {saveVersion,closeHistoryDb}=await import("../src/lib/history-db.ts");
 const {startSession,readSession,saveRound,listSessions,changeSessionState,getInterviewContext}=await import("../src/lib/interview-db.ts");
 try{
 const base={profileTitle:"Master",company:"Example Co",role:"AI PM",jdText:"AI product",label:"First",note:"",snapshot:example,decisions:{}};
 const a=saveVersion(base);
 const b=saveVersion({...base,profileId:a.profileId,company:"Other",role:"Operations",jdText:"Data operations",snapshot:{...example,projectExperience:[]}});
 const question=firstQuestion("AI PM","project",example,"AI product");
 const session=startSession(a.id,"project",question,"mock");
 assert.equal(session.versionId,a.id);
 assert.equal(session.roundCount,0);
 assert.equal(getInterviewContext(session.versionId).jd,"AI product");
 assert.notEqual(getInterviewContext(session.versionId).jd,getInterviewContext(b.id).jd);
 assert.equal(changeSessionState(session.id,"pause").status,"paused");
 const mocked=mockRound("ALPHA complete with numbers 123","project",example,"AI PM",1);
 assert.throws(()=>saveRound(session.id,1,"Paused answer",mocked.feedback,mocked.nextQuestion));
 assert.equal(changeSessionState(session.id,"resume").status,"active");
 const first=saveRound(session.id,1,"ALPHA complete with numbers 123",mocked.feedback,mocked.nextQuestion);
 assert.equal(first.roundCount,1);
 assert.equal(first.turns[0].question,question);
 assert.equal(first.turns[0].feedback.source,"mock");
 assert(first.question.includes("ALPHA"));
 assert.throws(()=>saveRound(session.id,1,"Duplicate",mocked.feedback,mocked.nextQuestion));
 assert.equal(readSession(session.id).turns.length,1);
 assert.equal(listSessions()[0].versionId,a.id);
 assert.equal(changeSessionState(session.id,"finish").status,"completed");
 assert.throws(()=>changeSessionState(session.id,"resume"));
 }finally{closeHistoryDb();rmSync(dir,{force:true,recursive:true});}
});
