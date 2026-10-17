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
 const [connecting,setConnecting]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");

 async function refresh(){
   const response=await fetch("/api/chatgpt-subscription",{cache:"no-store"});
   if(!response.ok)throw Error("订阅状态读取失败，请确认登录状态");
   const data=await response.json() as Status;
   setStatus(data);
   setModel(old=>old||data.model||"");
   return data;
 }
 useEffect(()=>{
   let active=true;
   fetch("/api/chatgpt-subscription",{cache:"no-store"})
     .then(async response=>{if(!response.ok)throw Error("订阅状态读取失败");return response.json();})
     .then((data:Status)=>{if(active){setStatus(data);setModel(data.model||"");}})
     .catch(error=>{if(active)setError(error.message);});
   return ()=>{active=false;};
 },[]);
 useEffect(()=>{
   if(!connecting)return;
   const expires=Date.now()+12*60*1000;
   const poll=setInterval(async()=>{
     if(Date.now()>expires){
       setConnecting(false);
       setError("等待授权超时，请重新点击连接 ChatGPT。");
       return;
     }
     try{
       const result=await refresh();
       if(result.connected){
         setConnecting(false);
         setNotice("订阅授权已安全导入 VPS。请读取账号模型列表，再选择启用。");
       }
     }catch{}
   },2500);
   return ()=>clearInterval(poll);
 },[connecting]);

 async function connect(){
   // Open a tab synchronously as part of the owner's click to avoid popup blocking.
   const tab=window.open("about:blank","_blank");
   if(!tab){setError("浏览器阻止了新窗口。请允许本站打开本机授权页后重试。");return;}
   setPending(true);setError("");setNotice("");
   try{
     const response=await fetch("/api/chatgpt-subscription/pair",{
       method:"POST",headers:{"Content-Type":"application/json"},body:"{}"
     });
     const data=await response.json();
     if(!response.ok||typeof data.token!=="string")throw Error(data.error||"创建授权连接失败");
     tab.location.href="http://127.0.0.1:46729/connect#pair="+encodeURIComponent(data.token);
     setConnecting(true);
     setNotice("已打开本机授权页面。请在新标签页点击“继续使用 ChatGPT 授权”，然后在 OpenAI 页面完成登录和许可。");
   }catch(error){
     tab.close();setError((error as Error).message);
   }finally{setPending(false);}
 }
 async function action(type:"models"|"activate"|"disconnect"|"test"){
   setPending(true);setError("");setNotice("");
   try{
     if(type==="disconnect"&&!window.confirm("确定断开 ChatGPT 订阅？将清除 VPS 上的授权凭据，并尝试撤销远程令牌。"))return;
     const response=await fetch("/api/chatgpt-subscription",{
       method:type==="disconnect"?"DELETE":"POST",
       headers:{"Content-Type":"application/json"},
       ...(type==="disconnect"?{}:{body:JSON.stringify(type==="models"?{action:"models"}:type==="test"?{action:"test"}:{action:"activate",model})})
     });
     const result=await response.json();
     if(!response.ok||!result.ok)throw Error(result.error||"操作失败");
     if(type==="test"){
       setNotice(result.message||"真实订阅模型调用成功。");
     }else if(type==="models"){
       setModels(result.models||[]);
       if(!model&&result.models?.[0])setModel(result.models[0].id);
       setNotice("已读取你的 ChatGPT 订阅账号可用模型。");
     }else if(type==="disconnect"){
       setModels([]);setConnecting(false);
       setNotice(result.revoked?"本地授权已清除，远程授权已撤销。":"VPS 凭据已清除；远程撤销未确认，可在 ChatGPT 设置中取消授权。");
     }else{
       setNotice("订阅模型已启用。后续请求将走官方 Responses API，不会自动切换到其他付费 API。");
     }
     await refresh();
   }catch(error){setError((error as Error).message);}
   finally{setPending(false);}
 }
 return <Card>
   <CardHeader><CardTitle>ChatGPT Plus / Pro · 订阅 OAuth</CardTitle></CardHeader>
   <CardContent className="space-y-3 text-sm">
     <p className="text-neutral-600">在浏览器中连接 ChatGPT 订阅。授权回调由本机助手处理，通过 HTTPS 安全交给你的自托管 VPS，不使用网站上的公开 OAuth 回调。</p>
     {status?.connected?
       <p role="status" className="text-emerald-700 font-medium">已连接订阅 {status.active?"· 当前正在使用":"· 尚未启用"}。当前模型：{status.model||"尚未选择"}</p>:
       <p role="status" className="text-amber-700">未连接 ChatGPT 订阅，当前不会消耗你的订阅额度。</p>}
     {!!error&&<p role="alert" className="text-red-700">{error}</p>}
     {!!notice&&<p role="status" className="text-emerald-700">{notice}</p>}
     <div className="flex items-center flex-wrap gap-2">
       <Button disabled={pending||connecting} onClick={()=>void connect()}>
         {connecting?"等待授权完成…":status?.connected?"重新连接 ChatGPT":"连接 ChatGPT 订阅"}
       </Button>
       <Button variant="outline" disabled={pending} onClick={()=>void refresh().catch(error=>setError(error.message))}>
         刷新连接状态
       </Button>
     </div>
     <p className="text-xs text-neutral-600">只需点击“连接 ChatGPT 订阅”，在新页面确认授权。由已安装的本机助手自动处理，无需运行命令、手动复制 Token 或执行 SSH。第一次连接请在你的 Windows 电脑上操作。</p>
     {status?.connected&&<>
       <div className="flex gap-2 flex-wrap">
         <Button variant="outline" disabled={pending} onClick={()=>void action("models")}>读取订阅可用模型</Button>
         {status.active&&<Button variant="outline" disabled={pending} onClick={()=>void action("test")}>测试当前订阅模型</Button>}
       </div>
       {models.length>0&&<label className="block">选择订阅模型
         <select aria-label="ChatGPT 订阅模型" className="mt-1 w-full rounded border p-2" value={model} onChange={e=>setModel(e.target.value)}>
           {models.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
         </select>
       </label>}
       <div className="flex gap-2 flex-wrap">
         <Button disabled={pending||!model} onClick={()=>void action("activate")}>启用订阅模型</Button>
         <Button variant="outline" disabled={pending} onClick={()=>void action("disconnect")}>断开授权</Button>
       </div>
     </>}
     <p className="text-xs text-neutral-500">模型请求使用官方 Responses API，不支持时不会擅自切换到另一计费渠道。订阅额度是否可用，以 OpenAI 授权与响应为准。</p>
   </CardContent>
 </Card>;
}
