import { NextResponse } from "next/server";
import { protectedRequest, limitAttempt } from "@/lib/auth";
import { createBrowserPair } from "@/lib/chatgpt-browser-pair";
export const runtime="nodejs";
export async function POST(request:Request){
 const denied=await protectedRequest(request,true);
 if(denied)return denied;
 if(!limitAttempt("siwc-pair-start",6))return NextResponse.json({error:"发起次数过多，请稍后重试"},{status:429});
 return NextResponse.json({ok:true,...createBrowserPair()},{headers:{"Cache-Control":"no-store"}});
}