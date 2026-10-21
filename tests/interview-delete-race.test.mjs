import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { historyDb,saveVersion,closeHistoryDb } from "../src/lib/history-db.ts";
import { startSession,readSession,saveRound,deleteInterviewSession,listSessions } from "../src/lib/interview-db.ts";
import { mockRound } from "../src/lib/interview-engine.ts";

test("a reply arriving after session deletion cannot persist a turn or change the deleted session",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"resume-deleted-reply-"));process.env.RESUME_DATA_DIR=dir;
  try {
    const snapshot={personalInfo:{name:"合成测试",phone:"",email:"",location:""},jobIntent:"测试岗位",summary:"合成内容",
      coreSkills:[],workExperience:[],projectExperience:[],skillsAndTools:[],education:{school:"",degree:"",period:""}};
    const version=saveVersion({profileTitle:"测试",company:"测试公司",role:"测试岗位",jdText:"合成 JD",label:"测试",note:"",snapshot,decisions:{}});
    const session=startSession(version.id,"project","请介绍项目","llm");
    assert(readSession(session.id));
    let complete;
    const pending=new Promise(resolve=>{complete=resolve;});
    const reply=pending.then(()=>{
      const result=mockRound("延迟返回的回答","project",snapshot,"测试岗位",1);
      return saveRound(session.id,1,"延迟返回的回答",result.feedback,result.nextQuestion);
    });
    assert.equal(deleteInterviewSession(session.id),true);
    const before=historyDb().prepare("SELECT * FROM interview_sessions WHERE id=?").get(session.id);
    complete();
    await assert.rejects(reply,/练习状态已变化/);
    assert.deepEqual(historyDb().prepare("SELECT * FROM interview_sessions WHERE id=?").get(session.id),before);
    assert.equal(historyDb().prepare("SELECT COUNT(*) AS count FROM interview_turns WHERE session_id=?").get(session.id).count,0);
    assert.equal(readSession(session.id),null);
    assert.equal(listSessions().length,0);
  } finally {
    closeHistoryDb();delete process.env.RESUME_DATA_DIR;rmSync(dir,{recursive:true,force:true});
  }
});
