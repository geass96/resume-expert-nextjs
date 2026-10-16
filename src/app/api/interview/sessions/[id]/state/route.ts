import { NextResponse } from "next/server";
import { protectedRequest,checkPayload } from "@/lib/auth";
import { changeSessionState } from "@/lib/interview-db";
export const runtime="nodejs";
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  const denied=await protectedRequest(request,true);if(denied)return denied;
  const oversized=checkPayload(request,1000);if(oversized)return oversized;
  try {
    const raw=await request.text();
    if(raw.length>1000)return NextResponse.json({error:"请求过大"},{status:413});
    const {action}=JSON.parse(raw);
    if(!["pause","resume","finish"].includes(action))return NextResponse.json({error:"操作类型错误"},{status:400});
    const {id}=await context.params;
    return NextResponse.json({session:changeSessionState(id,action)});
  }catch{return NextResponse.json({error:"无法更改状态，请刷新后重试"},{status:409});}
}
