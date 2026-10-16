import {test} from "node:test";
import assert from "node:assert/strict";
import {auditResumeEvidence} from "../src/lib/evidence-audit.ts";
const resume={personalInfo:{name:"",email:"",phone:"",location:""},jobIntent:"PM",summary:"Led an ERP migration",
  coreSkills:[],workExperience:[{company:"Demo",role:"PM",period:"",bullets:["Improved adoption by 43%","Owned onboarding","Saved 2 million dollars"]}],
  projectExperience:[],skillsAndTools:[],education:{school:"",degree:"",period:""}};
test("evidence checks avoid claiming unsupported numbers are true",()=>{
  const rows=auditResumeEvidence(resume,"Led an ERP migration. Improved adoption by 34%. Owned onboarding.");
  assert.equal(rows.find(r=>r.fieldPath==="summary").status,"text_match");
  assert.equal(rows.find(r=>r.fieldPath==="work:0:0").status,"missing_metric");
  assert.deepEqual(rows.find(r=>r.fieldPath==="work:0:0").missingMetrics,["43%"]);
  assert.equal(rows.find(r=>r.fieldPath==="work:0:1").status,"text_match");
  assert.equal(rows.find(r=>r.fieldPath==="work:0:2").status,"missing_metric");
  assert.equal(auditResumeEvidence(resume,"")[0].status,"no_source");
  assert.deepEqual(auditResumeEvidence(resume,""),auditResumeEvidence(resume,""));
});
