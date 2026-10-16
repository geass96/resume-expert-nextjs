import { NextResponse } from "next/server";
import { protectedRequest } from "@/lib/auth";
import { readSession,deleteInterviewSession } from "@/lib/interview-db";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  const denied=await protectedRequest(request); if(denied)return denied;
  const {id}=await context.params;
  const session=readSession(id);
  return session?NextResponse.json({session},{headers:{"Cache-Control":"no-store"}}):NextResponse.json({error:"练习不存在"},{status:404});
}

export async function DELETE(request:Request,context:{params:Promise<{id:string}>}){
  const denied=await protectedRequest(request,true); if(denied)return denied;
  const {id}=await context.params;
  return deleteInterviewSession(id)
    ?NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}})
    :NextResponse.json({error:"记录不存在"},{status:404});
}
