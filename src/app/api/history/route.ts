import { NextResponse } from "next/server";
import { protectedRequest,checkPayload } from "@/lib/auth";
import { listHistory,saveVersion } from "@/lib/history-db";
export const runtime="nodejs";
export async function GET(request:Request){
 const denied=await protectedRequest(request);if(denied)return denied;
 return NextResponse.json({versions:listHistory()},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request){
 const denied=await protectedRequest(request,true);if(denied)return denied;
 const oversized=checkPayload(request,1200000);if(oversized)return oversized;
 try {
  const body=await request.json();
  return NextResponse.json(saveVersion(body),{status:201});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"无法保存"},{status:400});}
}
