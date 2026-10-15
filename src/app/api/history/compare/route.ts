import { NextResponse } from "next/server";
import { protectedRequest } from "@/lib/auth";
import { getVersion } from "@/lib/history-db";
export const runtime="nodejs";
export async function GET(request:Request){
 const denied=await protectedRequest(request);if(denied)return denied;
 const url=new URL(request.url),a=getVersion(url.searchParams.get("a")||""),b=getVersion(url.searchParams.get("b")||"");
 if(!a||!b)return NextResponse.json({error:"对比版本不存在"},{status:404});
 return NextResponse.json({a,b},{headers:{"Cache-Control":"no-store"}});
}
