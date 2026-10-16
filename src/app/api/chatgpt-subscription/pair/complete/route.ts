import { NextResponse } from "next/server";
import { completeBrowserPair } from "@/lib/chatgpt-browser-pair";
import type { SiwcRecord } from "@/lib/chatgpt-subscription";
import { limitAttempt } from "@/lib/auth";
export const runtime="nodejs";
export async function POST(request:Request){
 if(!limitAttempt("siwc-pair-complete",24))return NextResponse.json({error:"请求过于频繁"},{status:429});
 const length=Number(request.headers.get("content-length")||0);
 if(length>24000)return NextResponse.json({error:"授权数据过长"},{status:413});
 try{
  const raw=await request.text();
  if(raw.length>24000)return NextResponse.json({error:"授权数据过长"},{status:413});
  const data=JSON.parse(raw) as {token?:string;credential?:SiwcRecord};
  if(!data.token||!data.credential)return NextResponse.json({error:"缺少授权配对信息"},{status:400});
  await completeBrowserPair(data.token,data.credential);
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"安全导入失败：配对已过期或 OpenAI 授权信息无法验证；请从模型配置重新连接"},{status:400});}
}