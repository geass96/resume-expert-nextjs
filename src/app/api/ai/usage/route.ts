import { NextResponse } from "next/server";
import { protectedRequest } from "@/lib/auth";
import { AI_PURPOSES, queryAIUsage, type AIPurpose, type AIUsageStatus } from "@/lib/ai-usage";
export const runtime="nodejs";
export async function GET(request:Request){
 const denied=await protectedRequest(request);if(denied)return denied;
 const p=new URL(request.url).searchParams;
 const days=Number(p.get("days")||30),purpose=p.get("purpose")||"",status=p.get("status")||"",model=p.get("model")||"";
 const page=Number(p.get("page")||1),pageSize=Number(p.get("pageSize")||25);
 if(![0,7,30,90].includes(days)||(purpose&&!(purpose in AI_PURPOSES))||
   (status&&status!=="success"&&status!=="failed")||
   !Number.isInteger(page)||page<1||page>10000||
   !Number.isInteger(pageSize)||pageSize<1||pageSize>100||model.length>120)
   return NextResponse.json({error:"用量筛选参数无效"},{status:400});
 try{
   return NextResponse.json(queryAIUsage({days:days as 0|7|30|90,
     purpose:purpose?purpose as AIPurpose:undefined,
     status:status?status as AIUsageStatus:undefined,
     model:model||undefined,page,pageSize}),{headers:{"Cache-Control":"no-store, private"}});
 }catch{return NextResponse.json({error:"AI 用量记录暂时无法读取"},{status:500});}
}
