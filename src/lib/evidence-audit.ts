import type { FinalResume } from "@/types/resume";

/** This is a source-text consistency check, never third-party fact verification. */
export type EvidenceFinding = {
  fieldPath: string;
  label: string;
  text: string;
  status: "text_match" | "missing_metric" | "needs_review" | "no_source";
  sourceExcerpt: string;
  missingMetrics: string[];
};
function normalized(s:string){return s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,"");}
function metrics(s:string){
  return [...new Set((s.match(/\d+(?:\.\d+)?\s*(?:%|％|万|亿|年|月|人|个|家|倍|元|天|次|k|K)?/g)||[]).map(s=>s.replace(/\s+/g,"")))];
}
function excerpt(source:string,target:string):string{
  const numbers=metrics(target);
  const index=numbers.map(v=>source.indexOf(v)).find(n=>n>=0);
  if(index!==undefined) return source.slice(Math.max(0,index-65),Math.min(source.length,index+120));
  const words=target.replace(/[，。、：；（）]/g," ").split(/\s+/).filter(w=>w.length>=3);
  for(const w of words){const i=source.indexOf(w.slice(0,8));if(i>=0)return source.slice(Math.max(0,i-50),Math.min(source.length,i+140));}
  return "";
}
export function auditResumeEvidence(resume:FinalResume,source:string):EvidenceFinding[]{
  const fields:Array<[string,string,string]>=[
    ["summary","职业摘要",resume.summary],
    ...resume.workExperience.flatMap((x,i)=>x.bullets.map((t,j)=>["work:"+i+":"+j,x.company+" · 经历 "+(j+1),t] as [string,string,string])),
    ...resume.projectExperience.flatMap((x,i)=>x.bullets.map((t,j)=>["project:"+i+":"+j,x.name+" · 项目 "+(j+1),t] as [string,string,string])),
  ];
  const evidenceSource=source.trim().slice(0,100000);
  const compact=normalized(evidenceSource);
  return fields.filter(([, ,text])=>text.trim()).map(([fieldPath,label,text])=>{
    const missingMetrics=metrics(text).filter(n=>!normalized(n)||!compact.includes(normalized(n)));
    const matched=compact.includes(normalized(text));
    return {
      fieldPath,label,text,missingMetrics,
      status:!evidenceSource?"no_source":missingMetrics.length?"missing_metric":matched?"text_match":"needs_review",
      sourceExcerpt:matched?excerpt(evidenceSource,text)||evidenceSource.slice(0,180):excerpt(evidenceSource,text),
    };
  });
}
