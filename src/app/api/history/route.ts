import { NextResponse } from "next/server";
import { protectedRequest, readLimitedJson } from "@/lib/auth";
import { listHistory,saveVersion } from "@/lib/history-db";
export const runtime="nodejs";
export async function GET(request:Request){
 const denied=await protectedRequest(request);if(denied)return denied;
 return NextResponse.json({versions:listHistory()},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request){
 const denied=await protectedRequest(request,true);if(denied)return denied;
 const parsed = await readLimitedJson<Parameters<typeof saveVersion>[0]>(request, 1200000, "历史版本内容过长", "请求格式错误");
 if (!parsed.ok) return parsed.response;
 try {
  return NextResponse.json(saveVersion(parsed.data),{status:201});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"无法保存"},{status:400});}
}
