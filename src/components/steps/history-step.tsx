"use client";

import { useCallback, useEffect, useState } from "react";
import { useResumeStore } from "@/store/resume-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionTitle } from "@/components/shared/ui-helpers";
import type { FinalResume } from "@/types/resume";

type Summary = {
 id:string;jobId:string;profileId:string;company:string;role:string;profileTitle:string;
 versionNo:number;label:string;createdAt:string;parentVersionId:string|null;contentHash:string;
};
type Saved = Summary & {snapshot:FinalResume;decisions:Record<string,unknown>;note:string};
const textFor = (resume:FinalResume) => [
 "求职方向："+resume.jobIntent,"职业摘要："+resume.summary,
 "核心技能："+resume.coreSkills.join("、"),
 ...resume.workExperience.flatMap(x=>[x.company+" · "+x.role,...x.bullets.map(b=>"  • "+b)]),
 ...resume.projectExperience.flatMap(x=>[x.name+" · "+x.role,...x.bullets.map(b=>"  • "+b)]),
 "技能工具："+resume.skillsAndTools.join("、"),
 "教育："+resume.education.school+" "+resume.education.degree
];
export function HistoryStep() {
 const {draftResume,userInput,proposalDecisions,parentVersionId,currentJobId,currentProfileId,markSaved,restoreVersion,setCurrentStep}=useResumeStore();
 const [rows,setRows]=useState<Summary[]>([]);
 const [profileTitle,setProfileTitle]=useState("我的主简历");
 const [company,setCompany]=useState("");
 const [role,setRole]=useState(userInput.targetRole);
 const [label,setLabel]=useState("");
 const [note,setNote]=useState("");
 const [left,setLeft]=useState("");
 const [right,setRight]=useState("");
 const [comparison,setComparison]=useState<{a:Saved;b:Saved}|null>(null);
 const [error,setError]=useState("");
 const [working,setWorking]=useState(false);
 const [message,setMessage]=useState("");
 const refresh=useCallback(async()=>{
  const response=await fetch("/api/history",{cache:"no-store"});
  if(!response.ok)throw Error("读取历史失败");
  const json=await response.json();setRows(json.versions);
 },[]);
 useEffect(()=>{fetch("/api/history",{cache:"no-store"}).then(r=>r.json()).then(d=>setRows(d.versions||[])).catch(e=>setError(e.message));},[]);
 
 async function save(){
  if(!draftResume)return;
  setWorking(true);setError("");setMessage("");
  try{
   const response=await fetch("/api/history",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({profileId:currentProfileId||undefined,jobId:currentJobId||undefined,
      parentVersionId:parentVersionId||undefined,profileTitle,company,role,
      jdText:userInput.jobDescription,label,note,snapshot:draftResume,decisions:proposalDecisions})});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||"保存失败");
   markSaved(result.id,result.profileId,result.jobId);
   setMessage("已保存不可变版本 V"+result.versionNo+"，之后的修改不会覆盖它");
   await refresh();
  }catch(e){setError((e as Error).message);}finally{setWorking(false);}
 }
 async function compare(){
  if(!left||!right)return;
  setWorking(true);setError("");
  try{
   const res=await fetch("/api/history/compare?a="+encodeURIComponent(left)+"&b="+encodeURIComponent(right),{cache:"no-store"});
   const data=await res.json();if(!res.ok)throw Error(data.error||"无法比较");
   setComparison(data);
  }catch(e){setError((e as Error).message);}finally{setWorking(false);}
 }
 async function restore(id:string){
  if(!window.confirm("从此历史版本建立新的编辑草稿？当前未保存的草稿将被替换，历史版本本身不会改变。"))return;
  const response=await fetch("/api/history/"+encodeURIComponent(id),{cache:"no-store"});
  const data=await response.json();
  if(!response.ok){setError(data.error||"恢复失败");return;}
  restoreVersion(data.snapshot,data.id,data.profileId,data.jobId);
  setCurrentStep("final-resume");
 }
 async function remove(id:string){
  if(!window.confirm("将该历史版本移入软删除状态？此操作不会删除线上简历应用。"))return;
  const r=await fetch("/api/history/"+id,{method:"DELETE"});
  if(r.ok){await refresh();setComparison(null);}else setError("删除失败");
 }
 const aa=comparison?textFor(comparison.a.snapshot):[];
 const bb=comparison?textFor(comparison.b.snapshot):[];
 return <div className="space-y-6">
  <SectionTitle title="历史简历与版本对比" description="按岗位保存不可变版本；对比历史、恢复为新草稿，不覆盖旧版本" />
  {error&&<p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  {message&&<p role="status" className="rounded bg-green-50 p-3 text-sm text-green-700">{message}</p>}
  <Card><CardHeader><CardTitle>定稿并保存新版本</CardTitle></CardHeader><CardContent className="space-y-3">
    {!draftResume&&<p className="text-sm text-amber-700">请先分析材料，或从下方恢复历史版本。</p>}
    <div className="grid grid-cols-2 gap-3">
     <div><Label htmlFor="profile">主简历名称</Label><Input id="profile" value={profileTitle} onChange={e=>setProfileTitle(e.target.value)} /></div>
     <div><Label htmlFor="company">目标公司</Label><Input id="company" value={company} onChange={e=>setCompany(e.target.value)} placeholder="可留空" /></div>
     <div><Label htmlFor="role">目标岗位</Label><Input id="role" value={role} onChange={e=>setRole(e.target.value)}/></div>
     <div><Label htmlFor="label">版本标记</Label><Input id="label" value={label} onChange={e=>setLabel(e.target.value)} placeholder="例：AI 产品经理投递版"/></div>
    </div>
    <Label htmlFor="memo">版本备注</Label>
    <Input id="memo" value={note} onChange={e=>setNote(e.target.value)} placeholder="本轮修改说明"/>
    <Button disabled={!draftResume||!role.trim()||working} onClick={()=>void save()}>{working?"处理中":"确认定稿并保存版本"}</Button>
    {parentVersionId&&<p className="text-xs text-neutral-500">当前草稿继承历史版本：{parentVersionId.slice(0,8)}</p>}
   </CardContent></Card>
  <Card><CardHeader><CardTitle>保存的历史版本（{rows.length}）</CardTitle></CardHeader><CardContent>
   {!rows.length&&<p className="text-sm text-neutral-500">尚未保存简历。完成分析并确认修改后，保存第一个版本。</p>}
   <div className="space-y-3">{rows.map(row=><div key={row.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
    <div><p className="font-medium text-sm">{row.profileTitle} / {row.role} / {row.company||"未指定公司"}</p>
     <p className="text-xs text-neutral-500">V{row.versionNo} · {row.label} · {new Date(row.createdAt).toLocaleString("zh-CN")}</p></div>
    <div className="flex gap-2">
     <Button variant="outline" size="sm" onClick={()=>void restore(row.id)}>恢复为草稿</Button>
     <Button variant="ghost" size="sm" onClick={()=>void remove(row.id)}>移除</Button>
    </div>
   </div>)}</div>
  </CardContent></Card>
  <Card><CardHeader><CardTitle>两个版本对比</CardTitle></CardHeader><CardContent className="space-y-3">
   <div className="grid grid-cols-2 gap-3">
    <label className="text-sm">版本 A
     <select value={left} onChange={e=>setLeft(e.target.value)} className="block w-full border rounded p-2 mt-1">
      <option value="">选择基准版本</option>{rows.map(x=><option key={x.id} value={x.id}>{x.role} · V{x.versionNo} · {x.label}</option>)}
     </select>
    </label>
    <label className="text-sm">版本 B
     <select value={right} onChange={e=>setRight(e.target.value)} className="block w-full border rounded p-2 mt-1">
      <option value="">选择比较版本</option>{rows.map(x=><option key={x.id} value={x.id}>{x.role} · V{x.versionNo} · {x.label}</option>)}
     </select>
    </label>
   </div>
   <Button size="sm" variant="outline" disabled={!left||!right||left===right||working} onClick={()=>void compare()}>比较差异</Button>
   {comparison&&<div className="grid grid-cols-2 gap-3">
    {([aa,bb] as string[][]).map((lines,i)=><div key={i} className="border rounded p-3 space-y-1 min-w-0">
      <h3 className="font-semibold text-sm">版本 {i===0?"A":"B"} · V{i===0?comparison.a.versionNo:comparison.b.versionNo}</h3>
      {lines.map((line,j)=><p key={j} className={"text-xs whitespace-pre-wrap break-words p-1 rounded "+(line !== (i===0?bb:aa)[j]?"bg-amber-50 font-medium":"")}>{line}</p>)}
    </div>)}
   </div>}
   {comparison&&<div className="text-xs text-neutral-600 space-y-2">
      <p>黄色区域表示对应行存在差异。版本快照不会被对比操作修改。</p>
      <p>版本 B 修改记录（人工确认后保存）：</p>
      {Object.entries(comparison.b.decisions).length === 0 ? <p>本版本没有独立的建议决策记录。</p> :
       Object.entries(comparison.b.decisions).map(([id,record])=>{
         const d=record as {decision?:string;fieldPath?:string;at?:string};
         return <p key={id} className="border-b py-1">{id} · {d.decision||"手动修改"} · {d.fieldPath||"未指定条目"} · {d.at?new Date(d.at).toLocaleString("zh-CN"):""}</p>;
       })}
    </div>}
  </CardContent></Card>
 </div>;
}
