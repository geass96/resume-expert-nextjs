import { test } from "node:test";
import assert from "node:assert/strict";
import { compareResumeVersions } from "../src/lib/version-diff.ts";

const make = () => ({
  personalInfo:{name:"模拟用户",email:"demo@example.invalid",phone:"000",location:"北京"},
  jobIntent:"产品经理",summary:"版本一",
  coreSkills:["规划"],workExperience:[
    {company:"演示公司",role:"产品经理",period:"2022-2024",bullets:["工作经历 A","工作经历 B"]},
  ],
  projectExperience:[{name:"演示项目",role:"负责人",period:"2023",bullets:["项目经历 A"]}],
  skillsAndTools:["SQL"],education:{school:"演示学校",degree:"本科",period:"2018-2022"}
});
test("unchanged versions yield no differences",()=>{
  const a=make();assert.deepEqual(compareResumeVersions(a,a),[]);
});
test("detects scalar changes and additions without shifted false positives",()=>{
  const a=make(),b=make();
  b.summary="版本二";
  b.workExperience[0].bullets.unshift("新插入的工作条目");
  b.projectExperience[0].bullets[0]="项目经历 B";
  const rows=compareResumeVersions(a,b);
  assert(rows.some(x=>x.label==="职业摘要"&&x.kind==="modified"&&x.before==="版本一"&&x.after==="版本二"));
  assert(rows.some(x=>x.kind==="added"&&x.after==="新插入的工作条目"));
  assert(!rows.some(x=>x.before==="工作经历 A"||x.before==="工作经历 B"),"unchanged bullets must remain matched");
  assert(rows.some(x=>x.kind==="modified"&&x.before==="项目经历 A"&&x.after==="项目经历 B"));
});
test("detects removal and preserves originals",()=>{
  const a=make(),b=make(); b.workExperience=[]; b.coreSkills=[];
  const raw=JSON.stringify(a);
  const rows=compareResumeVersions(a,b);
  assert(rows.some(x=>x.kind==="removed"&&x.label==="核心技能"));
  assert(rows.some(x=>x.kind==="removed"&&x.label.includes("演示公司")));
  assert.equal(JSON.stringify(a),raw);
});
