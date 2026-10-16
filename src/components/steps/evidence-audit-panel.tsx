"use client";
import { useMemo, useState } from "react";
import { useResumeStore } from "@/store/resume-store";
import { auditResumeEvidence } from "@/lib/evidence-audit";

const names={text_match:"原文找到相同表述（仍需确认真实性）",missing_metric:"数字未在原始材料中找到",needs_review:"没有找到相同原文，需人工核对",no_source:"尚无原始材料，不能判断"} as const;
export function EvidenceAuditPanel(){
  const draft=useResumeStore(s=>s.draftResume);
  const original=useResumeStore(s=>s.userInput.originalResume);
  const saved=useResumeStore(s=>s.proposalDecisions);
  const setEvidenceNote=useResumeStore(s=>s.setEvidenceNote);
  const [source,setSource]=useState(original);
  const [expanded,setExpanded]=useState(false);
  const records=useMemo(()=>draft?auditResumeEvidence(draft,source):[],[draft,source]);
  if(!draft)return null;
  const flags=records.filter(x=>x.status==="missing_metric"||x.status==="needs_review"||x.status==="no_source").length;
  return <section className="mb-5 rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
    <div className="flex items-center justify-between gap-4">
      <div>
        <h3 className="font-semibold text-sm">证据溯源与真实性复核</h3>
        <p className="text-xs text-neutral-600">依据原始材料查找原文与数字，不能证明事实真实；最终须由你确认。{flags} 项需重点核实。</p>
      </div>
      <button className="rounded border bg-white px-3 py-1 text-xs" onClick={()=>setExpanded(!expanded)}>{expanded?"收起核对":"展开核对"}</button>
    </div>
    {expanded&&<>
      <label className="block text-sm">可核实的原始简历、成绩材料或工作笔记（仅在本页进行比对）
        <textarea aria-label="证据来源原文" className="mt-1 block w-full rounded border p-2 text-xs min-h-24 bg-white"
          value={source} maxLength={100000} onChange={e=>setSource(e.target.value)} />
      </label>
      <p className="text-xs text-neutral-500">提示：数字一致也不代表数字真实。请核对统计口径、时间与个人贡献。手动录入的依据会随定稿版本存储。</p>
      <div className="max-h-[550px] overflow-y-auto space-y-3">
        {records.map(r=>{
          const note=saved["evidence:"+r.fieldPath]?.text||"";
          return <div className="rounded bg-white border p-3 space-y-2" key={r.fieldPath}>
            <p className="font-medium text-sm">{r.label}</p>
            <p className="text-xs whitespace-pre-wrap">{r.text}</p>
            <p className={"text-xs font-medium "+(r.status==="text_match"?"text-emerald-700":"text-amber-800")}>{names[r.status]}{r.missingMetrics.length>0?" · 待核对数字："+r.missingMetrics.join("、"):""}</p>
            {r.sourceExcerpt&&<p className="border-l-2 pl-2 text-xs text-neutral-500">原文线索：{r.sourceExcerpt}</p>}
            <label className="block text-xs">人工核实依据 / 统计口径
              <textarea aria-label={"证据说明 "+r.label} rows={2} className="block w-full border rounded p-2 mt-1"
                value={note} placeholder="记录可以核实的来源、项目背景与数据口径；不确定时留空。"
                onChange={e=>setEvidenceNote(r.fieldPath,e.target.value)}/>
            </label>
          </div>;
        })}
      </div>
    </>}
  </section>;
}
