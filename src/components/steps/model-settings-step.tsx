"use client";
import { useEffect,useState } from "react";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/shared/ui-helpers";

type Preset={label:string;baseUrl:string;suggested:string};
type Profile={id:string;provider:string;model:string;active:boolean;hasKey:boolean;updatedAt:string};
type ConfigData={providers:Record<string,Preset>;profiles:Profile[];mode:string;selectedId:string|null};
export function ModelSettingsStep(){
  const [data,setData]=useState<ConfigData|null>(null);
  const [provider,setProvider]=useState("openai");
  const [model,setModel]=useState("gpt-4o-mini");
  const [apiKey,setApiKey]=useState("");
  const [editingId,setEditingId]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  async function refresh(){
    const r=await fetch("/api/model-settings",{cache:"no-store"});
    if(!r.ok)throw Error("模型配置读取失败");
    setData(await r.json());
  }
  useEffect(()=>{void refresh().catch(e=>setError(e.message));},[]);
  async function action(operation:Record<string,unknown>,method="POST"){
    setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch("/api/model-settings",{
        method,headers:{"Content-Type":"application/json"},body:JSON.stringify(operation)
      });
      const result=await response.json();
      if(!response.ok||!result.ok)throw Error(result.error||"操作失败");
      if(operation.action==="save"){setApiKey("");setEditingId("");setNotice("配置保存成功。还需要在下方测试并启用，才会切换使用的模型。");}
      else if(operation.action==="test")setNotice("真实连接测试成功（可能产生少量模型费用）。");
      else setNotice("操作成功");
      await refresh();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const providers=data?.providers||{};
  return <div className="space-y-5">
    <SectionTitle title="模型配置" description="个人使用的模型接入控制台。模型密钥只保存在服务器，不回显，也不会写入 GitHub。" />
    {!!error&&<p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!!notice&&<p role="status" className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm">{notice}</p>}
    <Card><CardHeader><CardTitle>当前运行方式</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
      <p>{data?.mode==="llm"?"已选择真实模型":data?.mode==="mock"?"手动模拟模式":"沿用服务器环境变量 / Mock（尚未选定页面配置）"}</p>
      <Button variant="outline" disabled={busy} onClick={()=>void action({action:"mock"})}>切换到 Mock 模拟模式</Button>
      <p className="text-xs text-neutral-500">切换模型后，新发起的简历分析、建议改写和面试评价使用所选模型。此前已生成的记录不会自动重写。</p>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{editingId?"更新模型配置":"添加模型服务"}</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">服务商
          <select aria-label="模型服务商" className="mt-1 w-full rounded border p-2" value={provider}
            onChange={e=>{const id=e.target.value;setProvider(id);setModel(providers[id]?.suggested||"");}}>
            {Object.entries(providers).map(([id,item])=><option key={id} value={id}>{item.label}</option>)}
          </select>
        </label>
        <label className="text-sm">模型 ID
          <input aria-label="模型 ID" className="mt-1 w-full rounded border p-2" value={model} maxLength={120}
            onChange={e=>setModel(e.target.value)} placeholder="例如 gpt-4o-mini"/>
        </label>
      </div>
      <p className="text-xs text-neutral-500">安全白名单端点：{providers[provider]?.baseUrl||"加载中"}。如使用付费订阅套餐提供的 API Token，请按该套餐官方说明填写模型 ID。</p>
      <label className="block text-sm">API Key / 服务商提供的套餐 Token
        <input aria-label="模型 API Key" type="password" autoComplete="off"
          value={apiKey} onChange={e=>setApiKey(e.target.value)} className="mt-1 w-full rounded border p-2" placeholder={editingId?"留空则继续保留已有凭据":"仅用于服务端加密保存"}/>
      </label>
      <div className="flex gap-2">
        <Button disabled={busy||!model||(!editingId&&!apiKey)} onClick={()=>void action({action:"save",provider,model,apiKey,...(editingId?{id:editingId}:{})})}>保存配置</Button>
        {editingId&&<Button variant="outline" disabled={busy} onClick={()=>{setEditingId("");setApiKey("");}}>取消编辑</Button>}
      </div>
      <p className="text-xs text-amber-800">pi 支持的 ChatGPT / Claude / Copilot 订阅 OAuth 登录，与 API Key 不是同一认证方式。本页面目前支持 OpenAI 兼容 API 及服务商套餐 Token；不能将 ChatGPT Plus 账号密码或 OAuth 回调码填入这里。</p>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>已保存模型（{data?.profiles.length||0}）</CardTitle></CardHeader><CardContent className="space-y-3">
      {!data?.profiles.length&&<p className="text-sm text-neutral-500">暂未配置任何模型，当前仍可使用 Mock 模式。</p>}
      {data?.profiles.map(p=><div key={p.id} className="border rounded p-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sm">{providers[p.provider]?.label||p.provider} · {p.model}</p>
          <p className="text-xs text-neutral-500">{p.active?"正在使用 · ":""}密钥已加密保存 · {new Date(p.updatedAt).toLocaleString("zh-CN")}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" disabled={busy} onClick={()=>{setEditingId(p.id);setProvider(p.provider);setModel(p.model);setApiKey("");}}>编辑</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={()=>void action({action:"test",id:p.id})}>测试</Button>
          <Button size="sm" disabled={busy||p.active} onClick={()=>void action({action:"activate",id:p.id})}>{p.active?"使用中":"启用"}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={()=>{
            if(window.confirm("确定删除此模型配置？保存的加密 API Key 将一并移除。"))
              void action({id:p.id},"DELETE");
          }}>删除</Button>
        </div>
      </div>)}
    </CardContent></Card>
  </div>;
}
