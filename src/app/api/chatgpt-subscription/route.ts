import { NextResponse } from "next/server";
import { protectedRequest,checkPayload,limitAttempt } from "@/lib/auth";
import { disconnectSubscription,selectSubscription,subscriptionAccessToken,subscriptionStatus } from "@/lib/chatgpt-subscription";

export const runtime="nodejs";
export async function GET(request:Request){
 const denied=await protectedRequest(request);if(denied)return denied;
 return NextResponse.json(subscriptionStatus(),{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request){
 const denied=await protectedRequest(request,true);if(denied)return denied;
 const oversized=checkPayload(request,2000);if(oversized)return oversized;
 if(!limitAttempt("siwc-operation",10))return NextResponse.json({error:"操作过于频繁"},{status:429});
 try{
   const raw=await request.text();
   if(raw.length>2000)return NextResponse.json({error:"请求过长"},{status:413});
   const body=JSON.parse(raw) as {action?:string;model?:string};
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
