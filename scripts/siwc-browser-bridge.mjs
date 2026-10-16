#!/usr/bin/env node
// Personal Windows loopback bridge for OpenAI SIWC.
// Only localhost listens, no browser password or token ever reaches page JavaScript.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PORT=46729;
const BIND="127.0.0.1";
const SITE="https://resume-expert.geis.de5.net";
const LOGIN=join(dirname(fileURLToPath(import.meta.url)),"siwc-login.mjs");
const CREDS=join(homedir(),".resume-expert","siwc-chatgpt.json");
let active=null;
function response(res,status,data,type="application/json; charset=utf-8"){
 res.writeHead(status,{"Content-Type":type,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer","Cross-Origin-Resource-Policy":"same-origin"});
 res.end(type.startsWith("application/json")?JSON.stringify(data):data);
}
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Resume Expert · ChatGPT 授权</title>
<style>body{font:15px system-ui,sans-serif;margin:0;background:#f7f7f9;color:#24252b}
main{max-width:560px;margin:12vh auto;padding:30px;border:1px solid #e5e7eb;border-radius:14px;background:white}
button{padding:12px 20px;border:0;border-radius:8px;background:#191d2a;color:#fff;cursor:pointer}
p{line-height:1.7}#message{margin-top:20px}small{color:#696c74}</style>
<main><h2>Resume Expert · 连接 ChatGPT</h2>
<p>登录将在 OpenAI 官方网页进行。授权结束后，本机连接助手将通过加密 HTTPS 将凭据交给你自己的 Resume Expert VPS，不需要复制 Token 或执行命令。</p>
<button id="begin">继续使用 ChatGPT 授权</button>
<p id="message" role="status">请点击按钮开始授权。</p>
<small>此页面仅运行于你的电脑 127.0.0.1。</small></main>
<script>
const token=new URLSearchParams(location.hash.slice(1)).get("pair");
history.replaceState(null,"",location.pathname);
const msg=document.getElementById("message");
const btn=document.getElementById("begin");
if(!token||!/^[-_a-zA-Z0-9]{40,60}$/.test(token)){msg.textContent="无效的连接邀请，请返回模型配置重新发起。";btn.disabled=true;}
const timer=setInterval(async()=>{
 try{const r=await fetch("/status",{cache:"no-store"});const d=await r.json();
 if(d.status==="complete"){msg.textContent="ChatGPT 授权已安全导入 VPS。返回简历专家网页刷新连接状态即可。";btn.disabled=true;clearInterval(timer);}
 else if(d.status==="failed"){msg.textContent=d.message||"连接失败，请返回模型配置重试。";btn.disabled=false;clearInterval(timer);}
 else if(d.status==="awaiting"){msg.textContent="等待你在 OpenAI 官方网页完成授权……";btn.disabled=true;}
 }catch{}
},2000);
btn.addEventListener("click",async()=>{
 const tab=window.open("about:blank","_blank");
 btn.disabled=true;msg.textContent="正在启动本机 OAuth……";
 try{
  const r=await fetch("/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});
  const d=await r.json();
  if(!r.ok||!d.url||!d.url.startsWith("https://auth.openai.com/api/accounts/authorize"))throw Error(d.error||"无法启动授权");
  if(tab)tab.location.href=d.url;else{msg.textContent="弹窗被拦截，请允许弹窗后重试。";btn.disabled=false;}
 }catch(e){if(tab)tab.close();msg.textContent="启动失败："+e.message;btn.disabled=false;}
});
</script></html>`;
function launch(){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[LOGIN],{cwd:dirname(LOGIN),windowsHide:true,
    env:{...process.env,RESUME_SIWC_BRIDGE:"1"},stdio:["ignore","pipe","pipe"]});
  let output="",err="";
  let delivered=false;
  const timer=setTimeout(()=>{if(!delivered){child.kill();reject(Error("本机 OAuth 初始化超时"));}},12000);
  child.stdout.setEncoding("utf8");
  child.stdout.on("data",text=>{
    output=(output+text).slice(-12000);
    const match=output.match(/https:\/\/auth\.openai\.com\/api\/accounts\/authorize[^\r\n]*/);
    if(match&&!delivered){
      delivered=true;clearTimeout(timer);
      resolve({url:match[0],child});
    }
  });
  child.stderr.on("data",data=>{err=(err+data).slice(-1500);});
  child.on("error",e=>{if(!delivered){clearTimeout(timer);reject(e);}});
  child.on("close",code=>{
    clearTimeout(timer);
    if(!delivered)reject(Error("OAuth 进程未能启动"));
    else if(active?.child===child){
      void (async()=>{
        if(code!==0)throw Error("OpenAI 登录未完成或用户取消授权");
        const raw=await readFile(CREDS,"utf8");
        if(raw.length>12000)throw Error("OAuth 授权文件格式异常");
        const credential=JSON.parse(raw);
        const reply=await fetch(SITE+"/api/chatgpt-subscription/pair/complete",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({token:active.token,credential}),
          signal:AbortSignal.timeout(24000)
        });
        if(!reply.ok)throw Error("VPS 拒绝导入：授权可能过期，请从模型配置重新开始");
        active.status="complete";active.message="安全导入成功";
      })().catch(e=>{if(active){active.status="failed";active.message=e.message;}});
    }
  });
 });
}
const server=createServer(async(req,res)=>{
 if(req.headers.host!==BIND+":"+PORT){response(res,403,{error:"Invalid host"});return;}
 const path=new URL(req.url||"/","http://127.0.0.1").pathname;
 if(req.method==="GET"&&path==="/connect"){
  response(res,200,html,"text/html; charset=utf-8");return;
 }
 if(req.method==="GET"&&path==="/status"){
  response(res,200,{status:active?.status||"idle",message:active?.message||""});return;
 }
 if(req.method==="GET"&&path==="/health"){
  response(res,200,{ok:true,version:1});return;
 }
 if(req.method==="POST"&&path==="/start"){
  if(req.headers.origin!==`http://${BIND}:${PORT}` ||
   !req.headers["content-type"]?.startsWith("application/json")){
   response(res,403,{error:"仅接受本机页面发起的授权"});return;
  }
  let text="";
  for await(const part of req){text+=part.toString();if(text.length>1000){response(res,413,{error:"请求过大"});return;}}
  let token="";
  try{token=JSON.parse(text).token;}catch{}
  if(typeof token!=="string"||!/^[-_a-zA-Z0-9]{40,60}$/.test(token)){
   response(res,400,{error:"配对信息无效"});return;
  }
  if(active?.status==="awaiting"){response(res,409,{error:"已有授权正在进行"});return;}
  active={token,status:"awaiting",message:""};
  try{const {url,child}=await launch();active.child=child;response(res,200,{url});}
  catch(e){active.status="failed";active.message=String(e.message);response(res,502,{error:"本机 OAuth 启动失败"});}
  return;
 }
 response(res,404,{error:"Not found"});
});
server.listen(PORT,BIND,()=>{process.stdout.write("RESUME_BROWSER_BRIDGE_READY "+BIND+":"+PORT+"\n");});
