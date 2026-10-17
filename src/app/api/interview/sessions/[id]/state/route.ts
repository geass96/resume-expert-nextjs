import { NextResponse } from "next/server";
import { protectedRequest, readLimitedJson } from "@/lib/auth";
import { changeSessionState } from "@/lib/interview-db";
export const runtime="nodejs";
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  const denied=await protectedRequest(request,true);if(denied)return denied;
  const parsed = await readLimitedJson<{action?:unknown}>(request, 1000, "请求过大", "请求格式错误");
  if (!parsed.ok) return parsed.response;
  try {
    const action=parsed.data.action;
    if(action !== "pause" && action !== "resume" && action !== "finish")return NextResponse.json({error:"操作类型错误"},{status:400});
    const {id}=await context.params;
    return NextResponse.json({session:changeSessionState(id,action)});
  }catch{return NextResponse.json({error:"无法更改状态，请刷新后重试"},{status:409});}
}
