import { NextResponse } from "next/server";
import { clearLoginCookie,originAllowed } from "@/lib/auth";
export async function POST(request:Request) {
  if(!originAllowed(request))return NextResponse.json({error:"来源无效"},{status:403});
  const response=NextResponse.json({ok:true});clearLoginCookie(response);return response;
}
