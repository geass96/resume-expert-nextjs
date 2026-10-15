import { NextResponse } from "next/server";
import { limitAttempt,newSession,originAllowed,setLoginCookie,verifyPassword } from "@/lib/auth";
export async function POST(request:Request) {
  if(!originAllowed(request))return NextResponse.json({error:"来源无效"},{status:403});
  if(!limitAttempt("login:"+(request.headers.get("x-forwarded-for")||"unknown"),5))
    return NextResponse.json({error:"尝试次数过多"},{status:429});
  let password:unknown;
  try{password=(await request.json()).password;}catch{return NextResponse.json({error:"输入无效"},{status:400});}
  if(typeof password!=="string"||!verifyPassword(password))return NextResponse.json({error:"验证失败"},{status:401});
  const response=NextResponse.json({ok:true});setLoginCookie(response,newSession());return response;
}
