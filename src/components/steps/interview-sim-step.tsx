"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/shared/ui-helpers";
import { INTERVIEW_KINDS, INTERVIEW_MAX_ROUNDS } from "@/lib/interview-engine";
import type { InterviewKind, Feedback } from "@/lib/interview-engine";
import type { InterviewSession, InterviewTurn } from "@/lib/interview-db";

type Version = {
  id:string;role:string;company:string;profileTitle:string;versionNo:number;label:string;createdAt:string;
};
type Session = InterviewSession & {turns:InterviewTurn[];versionNo:number};
type Summary = Omit<Session,"turns">;
const scores = [
  ["authenticity","证据真实性"],["relevance","岗位相关性"],
  ["star","STAR 结构"],["clarity","表达清晰度"],["evidence","数据与证据口径"],
] as const;

function FeedbackPanel({feedback}:{feedback:Feedback}) {
  return <div className="rounded-lg border bg-neutral-50 p-3 space-y-3 text-sm">
    <div className="flex items-center justify-between">
      <span className="font-medium">训练评价 · {feedback.source==="mock"?"规则模拟":"AI 评价"}</span>
      <strong>{feedback.overall}/100</strong>
    </div>
    <div className="grid grid-cols-5 gap-2">
      {scores.map(([key,label])=><div key={key} className="rounded bg-white p-2 text-center border">
        <p className="text-xs text-neutral-600">{label}</p>
        <p className="font-semibold">{feedback.dimensions[key]}/5</p>
      </div>)}
    </div>
    {!!feedback.summary&&<p className="text-neutral-600">{feedback.summary}</p>}
    {!!feedback.strengths.length&&<p><strong>做得较好：</strong>{feedback.strengths.join("；")}</p>}
    {!!feedback.improvements.length&&<p><strong>改进建议：</strong>{feedback.improvements.join("；")}</p>}
    {!!feedback.evidenceGaps.length&&<p className="text-amber-800"><strong>待补强证据：</strong>{feedback.evidenceGaps.join("；")}</p>}
  </div>;
}

export function InterviewSimStep() {
  const [versions,setVersions]=useState<Version[]>([]);
  const [sessions,setSessions]=useState<Summary[]>([]);
  const [versionId,setVersionId]=useState("");
  const [kind,setKind]=useState<InterviewKind>("project");
  const [session,setSession]=useState<Session|null>(null);
  const [answer,setAnswer]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [compareId,setCompareId]=useState("");
  const [comparisonSession,setComparisonSession]=useState<Session|null>(null);

  async function loadLists(){
    const [a,b]=await Promise.all([fetch("/api/history",{cache:"no-store"}),fetch("/api/interview/sessions",{cache:"no-store"})]);
    if(!a.ok||!b.ok)throw Error("历史记录读取失败，请确认登录状态");
    const va=await a.json(),se=await b.json();
    const next=va.versions||[];
    setVersions(next);setSessions(se.sessions||[]);
    setVersionId(old=>old||next[0]?.id||"");
  }
  useEffect(()=>{
    let active=true;
    Promise.all([
      fetch("/api/history",{cache:"no-store"}).then(r=>{if(!r.ok)throw Error("无法读取历史版本");return r.json();}),
      fetch("/api/interview/sessions",{cache:"no-store"}).then(r=>{if(!r.ok)throw Error("无法读取面试记录");return r.json();}),
    ]).then(([a,b])=>{
      if(!active)return;
      setVersions(a.versions||[]);setSessions(b.sessions||[]);
      setVersionId((a.versions||[])[0]?.id||"");
    }).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[]);
  async function post(url:string,body:object){
    const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||"操作失败");
    return data;
  }
  async function start(){
    if(!versionId)return;
    setBusy(true);setError("");
    try{
      const data=await post("/api/interview/sessions",{versionId,kind});
      setSession(data.session);setAnswer("");setCompareId("");setComparisonSession(null);
      await loadLists();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function open(id:string){
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/interview/sessions/"+encodeURIComponent(id),{cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||"无法打开记录");
      setSession(data.session);setAnswer("");setCompareId("");setComparisonSession(null);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function submit(){
    if(!session||!answer.trim())return;
    setBusy(true);setError("");
    try{
      const data=await post("/api/interview/sessions/"+session.id+"/answer",{round:session.roundCount+1,answer});
      setSession(data.session);setAnswer("");await loadLists();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function state(action:"pause"|"resume"|"finish"){
    if(!session)return;
    setBusy(true);setError("");
    try{
      const data=await post("/api/interview/sessions/"+session.id+"/state",{action});
      setSession(data.session);await loadLists();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const selected=versions.find(v=>v.id===versionId);
  const comparable=sessions.filter(s=>session && s.jobId===session.jobId && s.id!==session.id);
   const average=(turns:InterviewTurn[])=>turns.length?Math.round(turns.reduce((sum,t)=>sum+t.feedback.overall,0)/turns.length):null;
  const dimensionAverage=(turns:InterviewTurn[],key:keyof Feedback["dimensions"])=>turns.length?(turns.reduce((sum,t)=>sum+t.feedback.dimensions[key],0)/turns.length).toFixed(1):"—";
  return <div className="space-y-5">
    <SectionTitle title="AI 模拟面试" description="从已定稿简历与目标 JD 出题，逐轮回答与追问；所有练习独立保存，不会改写历史简历。" />
    {error&&<p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <Card><CardHeader><CardTitle>创建新练习</CardTitle></CardHeader><CardContent className="grid grid-cols-[2fr_1fr_auto] gap-3 items-end">
      <label className="text-sm">确认版简历
        <select aria-label="确认版简历" className="mt-1 block w-full border rounded p-2" value={versionId} onChange={e=>setVersionId(e.target.value)}>
          {versions.length===0&&<option value="">尚无保存的简历</option>}
          {versions.map(v=><option key={v.id} value={v.id}>{v.role} · {v.company||"未指定公司"} · V{v.versionNo} · {v.label}</option>)}
        </select>
      </label>
      <label className="text-sm">模拟面试类型
        <select aria-label="模拟面试类型" className="mt-1 block w-full border rounded p-2" value={kind} onChange={e=>setKind(e.target.value as InterviewKind)}>
          {Object.entries(INTERVIEW_KINDS).map(([id,label])=><option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <Button disabled={busy||!versionId} onClick={()=>void start()}>开始新练习</Button>
      {selected&&<p className="col-span-3 text-xs text-neutral-500">已选择：{selected.profileTitle} · {selected.role} · V{selected.versionNo}。仅将该版本作为提问依据。</p>}
    </CardContent></Card>

    {session&&<Card><CardHeader><CardTitle>
      {INTERVIEW_KINDS[session.kind]} · V{session.versionNo} · {session.status==="active"?"进行中":session.status==="paused"?"已暂停":"已完成"}
    </CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm text-neutral-500">已回答 {session.roundCount}/{INTERVIEW_MAX_ROUNDS} 轮，{session.source==="mock"?"当前为规则模拟，不是大模型判断。":"当前调用真实大模型。"}训练评分不等于录用概率。</p>
      {session.turns.map(t=><div key={t.id} className="space-y-2 border-b pb-4">
        <p className="font-medium text-sm">Q{t.round}. {t.question}</p>
        <p className="whitespace-pre-wrap text-sm bg-neutral-50 rounded p-3">{t.answer}</p>
        <FeedbackPanel feedback={t.feedback}/>
      </div>)}
      {session.status==="active"&&<div className="space-y-3">
        <h3 className="font-semibold">Q{session.roundCount+1}. {session.question}</h3>
        <textarea aria-label="本轮回答" value={answer} onChange={e=>setAnswer(e.target.value)}
          maxLength={6500} placeholder="建议结合真实经历，说明情境、任务、行动、结果与量化数据口径。"
          className="w-full min-h-36 rounded border p-3 text-sm"/>
        <div className="flex gap-2">
          <Button disabled={busy||!answer.trim()} onClick={()=>void submit()}>{busy?"评价中":"提交回答并继续追问"}</Button>
          <Button variant="outline" disabled={busy} onClick={()=>void state("pause")}>暂停练习</Button>
          <Button variant="ghost" disabled={busy} onClick={()=>void state("finish")}>结束练习</Button>
        </div>
      </div>}
      {session.status==="paused"&&<div className="flex gap-2">
        <Button disabled={busy} onClick={()=>void state("resume")}>继续练习</Button>
        <Button disabled={busy} variant="outline" onClick={()=>void state("finish")}>结束练习</Button>
      </div>}
      {session.status==="completed"&&<p className="text-sm font-medium">本次练习已结束，可随时从下方历史记录回放。平均练习参考分：{average(session.turns)??"暂无"}</p>}
      {comparable.length>0&&<div className="rounded border p-3 space-y-2">
        <p className="font-medium text-sm">同一目标岗位的练习对比</p>
        <select aria-label="对比另一练习" className="border rounded p-2 text-sm" value={compareId} onChange={async e=>{const id=e.target.value;setCompareId(id);setComparisonSession(null);if(!id)return;try{const response=await fetch("/api/interview/sessions/"+encodeURIComponent(id),{cache:"no-store"});if(!response.ok)throw Error("对比练习读取失败");const data=await response.json();setComparisonSession(data.session);}catch(err){setError((err as Error).message);}}}>
          <option value="">选择另一场练习</option>
          {comparable.map(s=><option key={s.id} value={s.id}>{INTERVIEW_KINDS[s.kind]} · {new Date(s.createdAt).toLocaleString("zh-CN")}</option>)}
        </select>
        {comparisonSession&&<div className="space-y-2 text-sm"><p>当前平均：{average(session.turns)??"暂无"} 分；对比平均：{average(comparisonSession.turns)??"暂无"} 分（仅用于自我训练，不代表录用概率）。</p><div className="grid grid-cols-3 gap-2 text-xs"><strong>维度</strong><strong>当前</strong><strong>对比</strong>{scores.map(([key,label])=><div className="contents" key={key}><span>{label}</span><span>{dimensionAverage(session.turns,key)}</span><span>{dimensionAverage(comparisonSession.turns,key)}</span></div>)}</div></div>}
      </div>}
    </CardContent></Card>}

    <Card><CardHeader><CardTitle>历史练习（{sessions.length}）</CardTitle></CardHeader><CardContent className="space-y-2">
      {!sessions.length&&<p className="text-sm text-neutral-500">尚无练习，先保存简历版本后开始。</p>}
      {sessions.map(s=><div key={s.id} className="flex justify-between items-center gap-3 border rounded p-3">
        <div className="text-sm">
          <p className="font-medium">{s.role} · V{s.versionNo} · {INTERVIEW_KINDS[s.kind]}</p>
          <p className="text-xs text-neutral-500">{s.roundCount}/{INTERVIEW_MAX_ROUNDS} 轮 · {s.status==="active"?"进行中":s.status==="paused"?"已暂停":"已完成"} · {new Date(s.updatedAt).toLocaleString("zh-CN")}</p>
        </div>
        <Button variant="outline" size="sm" disabled={busy} onClick={()=>void open(s.id)}>{s.status==="completed"?"回放":"打开练习"}</Button>
      </div>)}
    </CardContent></Card>
  </div>;
}
