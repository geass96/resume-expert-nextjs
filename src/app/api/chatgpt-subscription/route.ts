import { NextResponse } from "next/server";
import { protectedRequest, limitAttempt, readLimitedJson } from "@/lib/auth";
import { disconnectSubscription,selectSubscription,subscriptionAccessToken,subscriptionStatus } from "@/lib/chatgpt-subscription";
import { chatCompletionJSON } from "@/lib/ai/client";
import { getAIConfig } from "@/lib/ai/config";

export const runtime="nodejs";
export async function GET(request:Request){
 const denied=await protectedRequest(request);if(denied)return denied;
 return NextResponse.json(subscriptionStatus(),{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request){
 const denied=await protectedRequest(request,true);if(denied)return denied;
 if(!limitAttempt("siwc-operation",10))return NextResponse.json({error:"操作过于频繁"},{status:429});
 const parsed = await readLimitedJson<{action?:string;model?:string}>(request, 2000, "请求过长", "请求格式错误");
 if (!parsed.ok) return parsed.response;
 try{
   const body=parsed.data;
   if(body.action==="test"){
     const status=subscriptionStatus(),config=getAIConfig();
     if(!status.connected||!status.active||config.provider!=="chatgpt-siwc")
       return NextResponse.json({error:"请先连接并启用 ChatGPT 订阅模型"},{status:409});
     const result=await chatCompletionJSON<{ok?:unknown;message?:unknown}>({
       system:"你是模型连通性测试器。只输出 JSON 对象，字段 ok 为 true，message 为连接成功。不要输出其他内容。",
       user:"请返回 {\"ok\":true,\"message\":\"连接成功\"}。",
       purpose:"model_connection_test",temperature:0,maxTokens:100,
     });
     if(result.ok!==true||typeof result.message!=="string"||!result.message.trim()||result.message.length>100)
       return NextResponse.json({error:"模型已响应，但返回结构未通过验收"},{status:502});
     return NextResponse.json({ok:true,model:config.model,message:"真实订阅模型调用成功"},{headers:{"Cache-Control":"no-store"}});
   }
   if(body.action==="activate"&&typeof body.model==="string"){
     selectSubscription(body.model);
     return NextResponse.json({ok:true});
   }
   if(body.action==="models"){
     if(!subscriptionStatus().connected)return NextResponse.json({error:"尚未完成 OAuth 授权"},{status:409});
     const token=await subscriptionAccessToken();
     const response=await fetch("https://api.openai.com/v1/models",{
       headers:{"Authorization":"Bearer "+token},signal:AbortSignal.timeout(15000),cache:"no-store"});
     if(!response.ok)return NextResponse.json({error:"订阅模型列表不可用（HTTP "+response.status+"）"},{status:502});
     const value=await response.json() as {models?:Array<{slug?:string;display_name?:string;visibility?:string}>};
     const models=(value.models||[]).filter(x=>x.visibility==="list"&&typeof x.slug==="string")
       .slice(0,80).map(x=>({id:x.slug!,label:x.display_name||x.slug!}));
     return NextResponse.json({ok:true,models},{headers:{"Cache-Control":"no-store"}});
   }
   return NextResponse.json({error:"不支持该操作"},{status:400});
 }catch{return NextResponse.json({error:"订阅操作失败，请检查本机 OAuth 授权是否已导入"},{status:400});}
}
export async function DELETE(request:Request){
 const denied=await protectedRequest(request,true);if(denied)return denied;
 try{
   const result=await disconnectSubscription();
   return NextResponse.json({ok:true,revoked:result.revoked});
 }catch{return NextResponse.json({error:"断开订阅失败"},{status:500});}
}
