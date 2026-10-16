"use client";
import { useEffect,useState } from "react";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";

type Status={connected:boolean;active:boolean;model:string|null;mode:string;hostId:string};
type ModelOption={id:string;label:string};
export function ChatGPTSubscriptionPanel(){
 const [status,setStatus]=useState<Status|null>(null);
 const [models,setModels]=useState<ModelOption[]>([]);
 const [model,setModel]=useState("");
 const [pending,setPending]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [guide,setGuide]=useState(false);
 async function refresh(){
   const response=await fetch("/api/chatgpt-subscription",{cache:"no-store"});
   if(!response.ok)throw Error("订阅连接状态获取失败，请确认登录");
   const data=await response.json() as Status;
   setStatus(data);
   setModel(old=>old||data.model||"");
 }
 useEffect(()=>{
   let live=true;
   fetch("/api/chatgpt-subscription",{cache:"no-store"})
    .then(async r=>{if(!r.ok)throw Error("订阅状态加载失败");return r.json();})
    .then((data:Status)=>{if(live){setStatus(data);setModel(data.model||"");}})
    .catch(e=>{if(live)setError(e.message);});
   return ()=>{live=false;};
 },[]);
 async function action(type:"models"|"activate"|"disconnect"){
   setPending(true);setError("");setNotice("");
   try{
     if(type==="disconnect"&&!window.confirm("确定断开 ChatGPT 订阅？将删除服务器本地授权数据，并尝试撤销远程令牌。"))return;
     const response=await fetch("/api/chatgpt-subscription",{
       method:type==="disconnect"?"DELETE":"POST",
       headers:{"Content-Type":"application/json"},
       ...(type==="disconnect"?{}:{body:JSON.stringify(type==="models"?{action:"models"}:{action:"activate",model})})
     });
     const data=await response.json();
     if(!response.ok||!data.ok)throw Error(data.error||"操作失败");
     if(type==="models"){
       setModels(data.models||[]);
       if(!model&&data.models?.[0])setModel(data.models[0].id);
       setNotice("已从你的 ChatGPT 订阅账号读取可用模型列表。");
     }else if(type==="disconnect"){
       setModels([]);
       setNotice(data.revoked?"已撤销远程会话并清除本地凭据。":"本地凭据已清除；远程撤销未确认，可在 ChatGPT 设置中断开此应用。");
     }else{
       setNotice("已选中 ChatGPT 订阅模型，新分析将走官方 Responses API，不会自动回退到付费 API Key。");
     }
     await refresh();
   }catch(e){setError((e as Error).message);}
   finally{setPending(false);}
 }
 return <Card>
   <CardHeader><CardTitle>ChatGPT Plus / Pro · 订阅 OAuth</CardTitle></CardHeader>
   <CardContent className="space-y-3 text-sm">
     <p className="text-neutral-600">采用 OpenAI 官方 Sign in with ChatGPT 方案。该个人自托管 VPS 使用「电脑本机 OAuth 登录 → SSH 安全导入 VPS」流程，而不是在公网网站接收 ChatGPT 授权回调。</p>
     {status?.connected?
       <p role="status" className="text-emerald-700 font-medium">已连接订阅 {status.active?"· 当前正在使用":"· 尚未启用"}。当前模型：{status.model||"未选择"}</p>:
       <p role="status" className="text-amber-700">未连接 ChatGPT 订阅，当前功能不会使用你的订阅额度。</p>}
     {!!error&&<p role="alert" className="text-red-700">{error}</p>}
     {!!notice&&<p role="status" className="text-emerald-700">{notice}</p>}
     <Button variant="outline" onClick={()=>setGuide(!guide)}>{guide?"收起授权说明":"查看本机 OAuth 授权步骤"}</Button>
     {guide&&<div className="rounded border bg-neutral-50 p-3 space-y-2 text-sm">
       <p>1. 在 Windows 电脑的本项目目录运行 <code>node scripts/siwc-login.mjs</code>。浏览器会打开 OpenAI 的授权界面，由你决定是否授权订阅额度。</p>
       <p>2. 授权完成后，按 <code>docs/CHATGPT-SUBSCRIPTION.md</code> 的 SSH 方式将受保护的授权文件通过加密连接导入你的 Oracle VPS。不要把 Token 粘贴到本页面或聊天中。</p>
       <p>3. 回到此页面刷新连接状态，读取订阅模型，选定后启用。不同模型与工作区的配额以 OpenAI 实际返回为准。</p>
       <p>重要：需要你在 ChatGPT 授权界面明确许可订阅用量，单纯授权身份登录不足以使用套餐额度。</p>
     </div>}
     {status?.connected&&<>
       <div className="flex items-center gap-2 flex-wrap">
         <Button variant="outline" disabled={pending} onClick={()=>void action("models")}>读取订阅可用模型</Button>
         <Button variant="outline" disabled={pending} onClick={()=>void refresh().catch(e=>setError(e.message))}>刷新连接状态</Button>
       </div>
       {models.length>0&&<label className="block">选择订阅模型
         <select aria-label="ChatGPT 订阅模型" className="mt-1 rounded border p-2 block w-full" value={model} onChange={e=>setModel(e.target.value)}>
           {models.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
         </select>
       </label>}
       <div className="flex gap-2">
         <Button disabled={pending||!model} onClick={()=>void action("activate")}>启用所选订阅模型</Button>
         <Button disabled={pending} variant="outline" onClick={()=>void action("disconnect")}>断开订阅授权</Button>
       </div>
     </>}
     <p className="text-xs text-neutral-500">订阅请求通过官方 <code>POST /v1/responses</code>，需 <code>store:false</code>、<code>stream:true</code>。不支持时不会私自改用另一个付费通道。</p>
   </CardContent>
 </Card>;
}
