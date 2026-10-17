import { NextResponse } from "next/server";
import { completeBrowserPair } from "@/lib/chatgpt-browser-pair";
import type { SiwcRecord } from "@/lib/chatgpt-subscription";
import { limitAttempt, rateLimitClientKey, readLimitedJson } from "@/lib/auth";
export const runtime="nodejs";
export async function POST(request:Request){
 if (!limitAttempt("siwc-pair-complete:" + rateLimitClientKey(request), 12)) return NextResponse.json({error:"请求过于频繁"},{status:429});
 const parsed = await readLimitedJson<{token?:string;credential?:SiwcRecord}>(request, 24000, "授权数据过长", "请求格式错误");
 if (!parsed.ok) return parsed.response;
 try{
  const data=parsed.data;
  if(!data.token||!data.credential)return NextResponse.json({error:"缺少授权配对信息"},{status:400});
  await completeBrowserPair(data.token,data.credential);
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"安全导入失败：配对已过期或 OpenAI 授权信息无法验证；请从模型配置重新连接"},{status:400});}
}