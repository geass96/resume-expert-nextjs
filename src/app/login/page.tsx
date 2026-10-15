"use client";
import { useState } from "react";
export default function LoginPage() {
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  async function submit(event:React.FormEvent) {
    event.preventDefault();setLoading(true);setError("");
    try {
      const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});
      if(!response.ok){setError(response.status===429?"尝试次数过多，请稍后再试":"密码不正确或登录未配置");return;}
      window.location.replace("/");
    }catch{setError("网络错误，请稍后重试");}finally{setLoading(false);}
  }
  return <main className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
    <form onSubmit={submit} className="w-full max-w-sm bg-white border rounded-xl p-8 space-y-5 shadow-sm">
      <h1 className="text-xl font-semibold">简历专家 · 私人工作台</h1>
      <p className="text-sm text-neutral-600">请输入个人访问密码。简历历史与 AI API 受访问保护。</p>
      <label className="block text-sm" htmlFor="password">访问密码</label>
      <input id="password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required className="w-full border rounded-lg p-3"/>
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={loading||!password} className="w-full rounded-lg bg-neutral-900 text-white p-3 disabled:opacity-50">{loading?"正在登录":"登录"}</button>
    </form>
  </main>;
}
