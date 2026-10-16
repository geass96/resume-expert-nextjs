"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionTitle } from "@/components/shared/ui-helpers";

const PURPOSES:Record<string,string>={
  jd_analysis:"JD 解析",resume_diagnosis:"简历诊断与匹配",
  initial_optimization:"首次优化简历",interview_preparation:"面试准备内容",
  regenerate_optimization:"重新生成优化",experience_followup:"经历追问改写",
  self_introduction:"生成自我介绍",interview_answer:"模拟面试评价",
  model_connection_test:"模型连通测试",other:"其他模型调用",
};
type UsageRow={
 id:string;createdAt:string;purpose:string;provider:string;model:string;
 channel:"subscription"|"api";status:"success"|"failed";durationMs:number;
 inputTokens:number|null;outputTokens:number|null;attempts:number;errorCode:string|null;
};
type Group={day?:string;purpose?:string;calls:number;inputTokens:number;outputTokens:number};
type Report={
 summary:{total:number;success:number;failed:number;reported:number;inputTokens:number;outputTokens:number;avgDurationMs:number|null};
 rows:UsageRow[];byPurpose:Group[];byDay:Group[];models:string[];
 hasMore:boolean;page:number;pageSize:number;days:number;
};
const nf=new Intl.NumberFormat("zh-CN");
const format=(n:number)=>nf.format(n);
const time=(value:string)=>new Date(value).toLocaleString("zh-CN",{hour12:false});
const tokens=(n:number|null)=>n===null?"未返回":format(n);
function Select({title,value,onChange,options}:{title:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[]}){
 return <label className="text-sm space-y-1 block">
   <span className="text-neutral-600">{title}</span>
   <select aria-label={title} className="block w-full rounded border border-neutral-200 bg-white p-2"
     value={value} onChange={e=>onChange(e.target.value)}>
     {options.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
   </select>
 </label>;
}
export function AIUsageStep(){
 const [days,setDays]=useState("30");
 const [purpose,setPurpose]=useState("");
 const [status,setStatus]=useState("");
 const [model,setModel]=useState("");
 const [page,setPage]=useState(1);
 const [refreshSeq,setRefreshSeq]=useState(0);
 const [report,setReport]=useState<Report|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");

 useEffect(()=>{
   const ctrl=new AbortController();
   const params=new URLSearchParams({days,purpose,status,model,page:String(page),pageSize:"25"});
   void fetch("/api/ai/usage?"+params.toString(),{signal:ctrl.signal,cache:"no-store"})
    .then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||"读取失败");return j as Report;})
    .then(j=>{if(!ctrl.signal.aborted)setReport(j);})
    .catch(e=>{if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:"无法读取用量记录");})
    .finally(()=>{if(!ctrl.signal.aborted)setLoading(false);});
   return ()=>ctrl.abort();
 },[days,purpose,status,model,page,refreshSeq]);
 const s=report?.summary;
 const chart=useMemo(()=>{
   const points=report?.byDay||[];
   return [...points].sort((a,b)=>(a.day||"").localeCompare(b.day||"")).slice(-14);
 },[report]);
 const maxDaily=Math.max(1,...chart.map(x=>x.calls));
 const totalKnown=(s?.inputTokens||0)+(s?.outputTokens||0);
 function reset(setter:(s:string)=>void,value:string){setLoading(true);setError("");setter(value);setPage(1);}
 const modelOptions=[{value:"",label:"全部模型"},...(report?.models||[]).map(m=>({value:m,label:m}))];
 if(model&&!modelOptions.some(o=>o.value===model))modelOptions.push({value:model,label:model});
 return <div className="space-y-5">
   <SectionTitle title="AI 用量与调用记录" description="了解 AI 功能的请求量、Token 用量、成功率和响应时间。仅记录技术指标，不保存提示词、简历内容或访问令牌。" />
   <Card><CardContent className="p-4">
     <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
       <Select title="统计范围" value={days} onChange={v=>reset(setDays,v)}
         options={[{value:"7",label:"最近 7 天"},{value:"30",label:"最近 30 天"},{value:"90",label:"最近 90 天"},{value:"0",label:"全部记录"}]}/>
       <Select title="调用功能" value={purpose} onChange={v=>reset(setPurpose,v)}
         options={[{value:"",label:"全部功能"},...Object.entries(PURPOSES).map(([value,label])=>({value,label}))]}/>
       <Select title="模型" value={model} onChange={v=>reset(setModel,v)} options={modelOptions}/>
       <Select title="状态" value={status} onChange={v=>reset(setStatus,v)}
         options={[{value:"",label:"全部状态"},{value:"success",label:"成功"},{value:"failed",label:"失败"}]}/>
       <div className="flex items-end"><Button variant="outline" className="w-full" disabled={loading}
         onClick={()=>{setLoading(true);setError("");setRefreshSeq(x=>x+1);}}>刷新统计</Button></div>
     </div>
   </CardContent></Card>
   {error&&<p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
   <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
     {([
       ["请求总数",s?format(s.total):"—","单次逻辑 AI 调用"],
       ["成功率",s&&s.total?((s.success/s.total)*100).toFixed(1)+"%":s?"—":"—",s?format(s.success)+" 成功 · "+format(s.failed)+" 失败":"—"],
       ["已报告 Tokens",s?format(totalKnown):"—",s?format(s.reported)+"/"+format(s.total)+" 次返回完整用量":"—"],
       ["平均耗时",s?.avgDurationMs!=null?(s.avgDurationMs/1000).toFixed(2)+" s":"—","每次逻辑调用的耗时"],
     ] as [string,string,string][]).map(([name,value,desc])=>
       <Card key={name}><CardContent className="p-4 space-y-1">
         <p className="text-sm text-neutral-600">{name}</p>
         <p className="text-2xl font-semibold tabular-nums">{value}</p>
         <p className="text-xs text-neutral-500">{desc}</p>
       </CardContent></Card>)}
   </div>
   <Card><CardHeader><CardTitle>Token 用量与每日调用量</CardTitle></CardHeader>
     <CardContent className="space-y-4">
       <div className="flex flex-wrap gap-6 text-sm">
         <span>输入 Tokens：<strong className="tabular-nums">{s?format(s.inputTokens):"—"}</strong></span>
         <span>输出 Tokens：<strong className="tabular-nums">{s?format(s.outputTokens):"—"}</strong></span>
         <span>已报告用量：<strong>{s?format(s.reported):"—"} 次</strong></span>
       </div>
       {chart.length? <div className="flex items-end gap-1.5 h-36" aria-label="最近有调用日期的每日请求量">
         {chart.map(row=><div key={row.day} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1" title={row.day+" UTC："+row.calls+" 次"}>
           <span className="text-center text-xs tabular-nums text-neutral-500">{row.calls}</span>
           <div className="rounded-t bg-neutral-800 min-h-1" style={{height:Math.max(5,(row.calls/maxDaily)*100)+"%"}}/>
           <span className="text-center text-[10px] text-neutral-500">{(row.day||"").slice(5)}</span>
         </div>)}
       </div> : <p className="text-sm text-neutral-500">筛选范围内暂无调用记录。</p>}
       <p className="text-xs text-neutral-500">统计按 UTC 日期分组，详细记录按本机时间显示。Tokens 仅累加服务商实际返回的数值；未报告的用量不估算，也不代表 ChatGPT 套餐剩余额度。</p>
     </CardContent></Card>
   <Card><CardHeader><CardTitle>按功能汇总</CardTitle></CardHeader>
     <CardContent>
       {report?.byPurpose.length?<div className="overflow-x-auto"><table className="w-full text-sm">
         <thead><tr className="border-b text-left text-neutral-500"><th className="py-2">调用功能</th><th>次数</th><th>输入 Tokens</th><th>输出 Tokens</th></tr></thead>
         <tbody>{report.byPurpose.map(g=><tr className="border-b last:border-0" key={g.purpose}>
           <td className="py-2">{PURPOSES[g.purpose||""]||g.purpose}</td>
           <td className="tabular-nums">{format(g.calls)}</td>
           <td className="tabular-nums">{format(g.inputTokens)}</td>
           <td className="tabular-nums">{format(g.outputTokens)}</td>
         </tr>)}</tbody>
       </table></div>:<p className="text-sm text-neutral-500">没有可显示的功能汇总。</p>}
     </CardContent></Card>
   <Card><CardHeader><CardTitle>最近调用明细</CardTitle></CardHeader>
     <CardContent className="space-y-3">
       {loading&&<p className="text-xs text-neutral-500" role="status">正在更新记录…</p>}
       <div className="overflow-x-auto">
         <table className="min-w-[930px] w-full text-xs">
           <thead><tr className="border-b text-left text-neutral-500">
             <th className="py-2">时间</th><th>功能</th><th>模型 / 来源</th>
             <th>状态</th><th>输入</th><th>输出</th><th>耗时</th><th>请求次数</th>
           </tr></thead>
           <tbody>{report?.rows.map(row=><tr key={row.id} className="border-b last:border-0">
             <td className="py-3 whitespace-nowrap">{time(row.createdAt)}</td>
             <td>{PURPOSES[row.purpose]||row.purpose}</td>
             <td><span className="font-medium">{row.model}</span>
               <p className="text-neutral-500">{row.provider} · {row.channel==="subscription"?"订阅":"API"}</p>
             </td>
             <td className={row.status==="success"?"text-emerald-700":"text-red-700"}>
               {row.status==="success"?"成功":"失败"}
               {row.errorCode&&<p className="text-neutral-500">{row.errorCode}</p>}
             </td>
             <td className="tabular-nums">{tokens(row.inputTokens)}</td>
             <td className="tabular-nums">{tokens(row.outputTokens)}</td>
             <td className="tabular-nums">{(row.durationMs/1000).toFixed(2)}s</td>
             <td>{row.attempts}</td>
           </tr>)}</tbody>
         </table>
         {report&&!report.rows.length&&<p className="py-6 text-center text-sm text-neutral-500">暂无调用明细。上线前的历史请求无法追溯。</p>}
       </div>
       <div className="flex justify-between items-center text-sm">
         <span className="text-neutral-500">第 {page} 页 · 每页最多 25 条</span>
         <div className="flex gap-2">
           <Button size="sm" variant="outline" disabled={loading||page<=1}
             onClick={()=>{setLoading(true);setError("");setPage(p=>Math.max(1,p-1));}}>上一页</Button>
           <Button size="sm" variant="outline" disabled={loading||!report?.hasMore}
             onClick={()=>{setLoading(true);setError("");setPage(p=>p+1);}}>下一页</Button>
         </div>
       </div>
     </CardContent></Card>
   <p className="text-xs text-neutral-500">本模块从 v0.7.0 起记录模型调用，不会补算历史用量。计数依据服务端逻辑调用，JSON 自动修复或授权重试会显示在“请求次数”中。没有记录真实文本、Token 密钥或个人简历内容。</p>
 </div>;
}
