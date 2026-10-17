import { NextResponse } from "next/server";
import { protectedRequest, limitAttempt, readLimitedJson } from "@/lib/auth";
import { createBrowserPair } from "@/lib/chatgpt-browser-pair";
export const runtime="nodejs";
export async function POST(request:Request){
 const denied=await protectedRequest(request,true);
 if(denied)return denied;
 if(!limitAttempt("siwc-pair-start",6))return NextResponse.json({error:"发起次数过多，请稍后重试"},{status:429});
 const parsed = await readLimitedJson<Record<string, unknown>>(request, 1000, "请求过大", "请求格式错误");
 if (!parsed.ok) return parsed.response;
 return NextResponse.json({ok:true,...createBrowserPair()},{headers:{"Cache-Control":"no-store"}});
}