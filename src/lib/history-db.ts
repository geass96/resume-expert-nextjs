import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { FinalResume, ResumeWorkflow } from "@/types/resume";

export type VersionRow = {
  id:string; jobId:string; profileId:string; company:string; role:string;
  profileTitle:string; versionNo:number; label:string; note:string;
  parentVersionId:string|null; createdAt:string; contentHash:string;
  snapshot:FinalResume; decisions:Record<string,unknown>;
  jobDescription:string; workflow:ResumeWorkflow|null;
};
let cached:DatabaseSync|undefined;
export function historyDb() {
  if(cached)return cached;
  const path=process.env.RESUME_DATA_DIR;
  if(!path)throw new Error("RESUME_DATA_DIR 未配置，历史存储不可用");
  mkdirSync(path,{recursive:true,mode:0o700});
  const db=new DatabaseSync(join(path,"resume-expert.sqlite"));
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
  db.exec("CREATE TABLE IF NOT EXISTS resume_profiles(id TEXT PRIMARY KEY,title TEXT NOT NULL,created_at TEXT NOT NULL);");
  db.exec("CREATE TABLE IF NOT EXISTS job_targets(id TEXT PRIMARY KEY,profile_id TEXT NOT NULL REFERENCES resume_profiles(id),company TEXT NOT NULL,role TEXT NOT NULL,jd_text TEXT NOT NULL,created_at TEXT NOT NULL);");
  db.exec("CREATE TABLE IF NOT EXISTS resume_versions(id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES job_targets(id),version_no INTEGER NOT NULL,parent_version_id TEXT, snapshot_json TEXT NOT NULL,decisions_json TEXT NOT NULL,content_hash TEXT NOT NULL,label TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL,deleted_at TEXT,UNIQUE(job_id,version_no));");
  const columns=db.prepare("PRAGMA table_info(resume_versions)").all();
  if(!columns.some(column=>column.name==="workflow_json"))
    db.exec("ALTER TABLE resume_versions ADD COLUMN workflow_json TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS history_by_job ON resume_versions(job_id,created_at);");
  db.exec("CREATE TABLE IF NOT EXISTS introductions(id TEXT PRIMARY KEY,version_id TEXT NOT NULL REFERENCES resume_versions(id),duration INTEGER NOT NULL,content TEXT NOT NULL,model TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(version_id,duration));");
  cached=db;return db;
}
export function listHistory() {
  return historyDb().prepare("SELECT v.id,v.job_id AS jobId,j.profile_id AS profileId,j.company,j.role,p.title AS profileTitle,v.version_no AS versionNo,v.parent_version_id AS parentVersionId,v.label,v.note,v.content_hash AS contentHash,v.created_at AS createdAt FROM resume_versions v JOIN job_targets j ON j.id=v.job_id JOIN resume_profiles p ON p.id=j.profile_id WHERE v.deleted_at IS NULL ORDER BY v.created_at DESC,v.version_no DESC LIMIT 300").all();
}
export function getVersion(id:string):VersionRow|null {
  const r=historyDb().prepare("SELECT v.*,j.profile_id,j.company,j.role,j.jd_text,p.title AS profile_title FROM resume_versions v JOIN job_targets j ON j.id=v.job_id JOIN resume_profiles p ON p.id=j.profile_id WHERE v.id=? AND v.deleted_at IS NULL").get(id) as Record<string,unknown>|undefined;
  if(!r)return null;
  return {id:String(r.id),jobId:String(r.job_id),profileId:String(r.profile_id),company:String(r.company),role:String(r.role),profileTitle:String(r.profile_title),versionNo:Number(r.version_no),label:String(r.label),note:String(r.note),parentVersionId:r.parent_version_id?String(r.parent_version_id):null,createdAt:String(r.created_at),contentHash:String(r.content_hash),snapshot:JSON.parse(String(r.snapshot_json)),decisions:JSON.parse(String(r.decisions_json)),jobDescription:String(r.jd_text),workflow:r.workflow_json?JSON.parse(String(r.workflow_json)):null};
}
export function saveVersion(input:{
 profileId?:string;jobId?:string;parentVersionId?:string;
 profileTitle:string;company?:string;role:string;jdText:string;label:string;note:string;
 snapshot:FinalResume;decisions:Record<string,unknown>;
 workflow?:ResumeWorkflow|null;
}) {
  const db=historyDb(),json=JSON.stringify(input.snapshot),decisions=JSON.stringify(input.decisions||{});
  if(json.length>90000||decisions.length>60000)throw Error("简历内容超过大小限制");
  const workflow=input.workflow ? JSON.stringify({
    ...input.workflow,userInput:{...input.workflow.userInput,targetRole:input.role.trim()},
  }) : null;
  if(workflow && workflow.length>240000)throw Error("分析过程超过大小限制");
  if(input.workflow)validateWorkflow(input.workflow);
  if(!input.snapshot||!Array.isArray(input.snapshot.workExperience)||!Array.isArray(input.snapshot.projectExperience)||!input.snapshot.personalInfo)throw Error("简历结构无效");
  if(!input.profileTitle.trim()||!input.role.trim()||input.profileTitle.length>100||input.role.length>160||(input.company?.length??0)>150||input.label.length>100||input.jdText.length>50000)throw Error("简历标题或岗位无效");
  const profileId=input.profileId||randomUUID();
  let jobId=input.jobId||randomUUID(),parentVersionId=input.parentVersionId||null;
  let company=input.company?.trim()??"";
  const jdText=input.workflow?.userInput.jobDescription??input.jdText;
  if(jdText.length>50000)throw Error("岗位 JD 超过大小限制");
  let forkedJob=false;
  const timestamp=new Date().toISOString(), id=randomUUID(),hash=createHash("sha256").update(json).digest("hex");
  db.exec("BEGIN IMMEDIATE");
  try {
    if(input.profileId) {
      if(!db.prepare("SELECT 1 FROM resume_profiles WHERE id=?").get(profileId))throw Error("主简历不存在");
    } else db.prepare("INSERT INTO resume_profiles VALUES(?,?,?)").run(profileId,input.profileTitle.trim(),timestamp);
    if(input.parentVersionId) {
      if(!db.prepare("SELECT 1 FROM resume_versions WHERE id=? AND job_id=?").get(input.parentVersionId,jobId))throw Error("父版本不属于此岗位");
    }
    if(input.jobId) {
      const prior=db.prepare("SELECT company,role,jd_text FROM job_targets WHERE id=? AND profile_id=?").get(jobId,profileId) as
        {company:string;role:string;jd_text:string}|undefined;
      if(!prior)throw Error("岗位版本关联不一致");
      if(input.company===undefined)company=prior.company;
      if(prior.company!==company||prior.role!==input.role.trim()||prior.jd_text!==jdText){
        jobId=randomUUID();parentVersionId=null;forkedJob=true;
      }
    }
    if(!input.jobId||forkedJob)
      db.prepare("INSERT INTO job_targets VALUES(?,?,?,?,?,?)").run(jobId,profileId,company,input.role.trim(),jdText,timestamp);
    const no=(db.prepare("SELECT coalesce(max(version_no),0)+1 AS number FROM resume_versions WHERE job_id=?").get(jobId) as {number:number}).number;
    db.prepare("INSERT INTO resume_versions(id,job_id,version_no,parent_version_id,snapshot_json,decisions_json,content_hash,label,note,created_at,workflow_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run(id,jobId,no,parentVersionId,json,decisions,hash,input.label.trim()||("版本 V"+no),input.note.slice(0,1000),timestamp,workflow);
    db.exec("COMMIT");
    return {id,profileId,jobId,versionNo:no,contentHash:hash,createdAt:timestamp,forkedJob};
  }catch(error){db.exec("ROLLBACK");throw error;}
}
function validateWorkflow(workflow:ResumeWorkflow) {
  const input=workflow.userInput;
  if(!input || !["targetRole","industry","companyType","jobStage","highlightSkills","jobDescription","originalResume","additionalInfo"].every(key=>typeof input[key as keyof typeof input]==="string") ||
    !["大厂","中型公司","创业公司","外企","国企"].includes(input.companyType) ||
    !["校招","社招-初级","社招-中级","社招-高级","转行"].includes(input.jobStage) ||
    !["concise","reduce-exaggeration","ai-product","tob-saas"].includes(workflow.optimizeStyle))
    throw Error("分析过程的输入材料无效");
  const result=workflow.analysisResult;
  if(result!==null && (!result || !result.jdAnalysis || !result.diagnosis || !result.finalResume || !result.interviewPrep ||
    ![result.matchItems,result.followUpQuestions,result.optimizedItems,result.jdAnalysis.responsibilities,
      result.jdAnalysis.hardRequirements,result.jdAnalysis.implicitRequirements,result.jdAnalysis.keywords,
      result.jdAnalysis.coreCompetencies,result.diagnosis.dimensionScores,result.diagnosis.mainIssues,
      result.diagnosis.prioritySuggestions,result.interviewPrep.likelyQuestions,result.interviewPrep.evidenceToPrepare,
      result.interviewPrep.possibleExaggerations,result.interviewPrep.dataToSupplement].every(Array.isArray)))
    throw Error("分析结果结构无效");
}
export function removeVersion(id:string) {
  const result=historyDb().prepare("UPDATE resume_versions SET deleted_at=? WHERE id=? AND deleted_at IS NULL").run(new Date().toISOString(),id);
  return result.changes>0;
}
export function introductionFor(versionId:string,duration:number){
  return historyDb().prepare("SELECT content,model,updated_at AS updatedAt FROM introductions WHERE version_id=? AND duration=?").get(versionId,duration);
}
export function saveIntroduction(versionId:string,duration:number,content:string,model:string){
  if(!getVersion(versionId))throw Error("版本不存在");
  if(![1,3].includes(duration)||content.length>5000)throw Error("介绍内容无效");
  const id=randomUUID();
  historyDb().prepare("INSERT INTO introductions VALUES(?,?,?,?,?,?) ON CONFLICT(version_id,duration) DO UPDATE SET content=excluded.content,model=excluded.model,updated_at=excluded.updated_at")
    .run(id,versionId,duration,content,model,new Date().toISOString());
}

export function closeHistoryDb() { cached?.close(); cached=undefined; }
