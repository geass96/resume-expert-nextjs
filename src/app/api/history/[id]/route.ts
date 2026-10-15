import { NextResponse } from "next/server";
import { protectedRequest } from "@/lib/auth";
import { getVersion,removeVersion } from "@/lib/history-db";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 const denied=await protectedRequest(request);if(denied)return denied;
 const {id}=await context.params,version=getVersion(id);
 return version?NextResponse.json(version,{headers:{"Cache-Control":"no-store"}}):NextResponse.json({error:"版本不存在"},{status:404});
}
export async function DELETE(request:Request,context:{params:Promise<{id:string}>}){
 const denied=await protectedRequest(request,true);if(denied)return denied;
 const {id}=await context.params;
 return removeVersion(id)?NextResponse.json({ok:true}):NextResponse.json({error:"版本不存在"},{status:404});
}
