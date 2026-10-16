import { NextResponse } from "next/server";
import { protectedRequest } from "@/lib/auth";
import { readSession } from "@/lib/interview-db";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  const denied=await protectedRequest(request); if(denied)return denied;
  const {id}=await context.params;
  const session=readSession(id);
  return session?NextResponse.json({session},{headers:{"Cache-Control":"no-store"}}):NextResponse.json({error:"练习不存在"},{status:404});
}
