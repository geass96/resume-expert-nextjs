import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync,rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { saveVersion,getVersion,removeVersion,closeHistoryDb } from "../src/lib/history-db.ts";
import { getInterviewContext } from "../src/lib/interview-db.ts";
import { useResumeStore } from "../src/store/resume-store.ts";

test("changed JD, role or company creates a new target without mutating prior versions and interview context", () => {
  const dir=mkdtempSync(join(tmpdir(),"resume-job-isolation-"));
  process.env.RESUME_DATA_DIR=dir;
  try {
    const snapshot={personalInfo:{name:"合成测试",phone:"",email:"",location:""},jobIntent:"A岗位",summary:"已确认摘要",
      coreSkills:[],workExperience:[],projectExperience:[],skillsAndTools:[],education:{school:"",degree:"",period:""}};
    const base={profileTitle:"合成主简历",company:"A公司",role:"A岗位",jdText:"A JD",label:"原始",note:"",snapshot,decisions:{}};
    const original=saveVersion(base);
    for (const change of [{jdText:"B JD"},{role:"B岗位"},{company:"B公司"}]) {
      const next=saveVersion({...base,...change,profileId:original.profileId,jobId:original.jobId,parentVersionId:original.id});
      assert.notEqual(next.jobId,original.jobId,"Changed target must not reuse the old JD record");
      assert.equal(next.profileId,original.profileId);
      assert.equal(next.versionNo,1);
      assert.equal(getVersion(next.id).parentVersionId,null);
      assert.equal(getVersion(next.id).jobDescription,change.jdText??base.jdText);
      assert.equal(getInterviewContext(next.id).jd,change.jdText??base.jdText);
      assert.equal(getVersion(next.id).role,change.role??base.role);
      assert.equal(getVersion(next.id).company,change.company??base.company);
      assert.equal(getInterviewContext(original.id).jd,"A JD");
      const sameTarget=saveVersion({...base,...change,profileId:next.profileId,jobId:next.jobId,parentVersionId:next.id});
      assert.equal(sameTarget.jobId,next.jobId);
      assert.equal(sameTarget.versionNo,2);
      assert.equal(getVersion(sameTarget.id).parentVersionId,next.id);
    }
    removeVersion(original.id);
    const afterDelete=saveVersion({...base,company:undefined,profileId:original.profileId,jobId:original.jobId,parentVersionId:original.id});
    assert.equal(afterDelete.jobId,original.jobId,"An untouched company must survive a missing history-list row");
    assert.equal(getVersion(afterDelete.id).company,"A公司");

    const workflow={userInput:{targetRole:"A岗位",industry:"软件",companyType:"中型公司",jobStage:"转行",highlightSkills:"",
      jobDescription:"B JD",originalResume:"合成材料",additionalInfo:""},analysisResult:null,optimizeStyle:"concise"};
    const editedRole=saveVersion({...base,role:"B岗位",workflow,profileId:original.profileId,jobId:original.jobId,parentVersionId:original.id});
    const saved=getVersion(editedRole.id);
    useResumeStore.getState().restoreVersion(saved.snapshot,saved.id,saved.profileId,saved.jobId,saved.role,saved);
    assert.equal(useResumeStore.getState().userInput.targetRole,"B岗位","Restore must use the saved role after history-form edits");
    assert.equal(saved.workflow.userInput.targetRole,"B岗位");
    assert.equal(saved.jobDescription,"B JD");
    const repeated=saveVersion({...base,role:useResumeStore.getState().userInput.targetRole,workflow:saved.workflow,
      profileId:saved.profileId,jobId:saved.jobId,parentVersionId:saved.id});
    assert.equal(repeated.jobId,saved.jobId,"Saving the restored target unchanged must not fork it again");
  } finally {
    closeHistoryDb();
    delete process.env.RESUME_DATA_DIR;
    rmSync(dir,{force:true,recursive:true});
  }
});
