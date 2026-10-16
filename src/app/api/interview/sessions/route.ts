import { NextResponse } from "next/server";
import { protectedRequest, checkPayload, limitAttempt } from "@/lib/auth";
import { listSessions, startSession, getInterviewContext } from "@/lib/interview-db";
import { firstQuestion, validKind } from "@/lib/interview-engine";
import { getAIConfig } from "@/lib/ai/config";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await protectedRequest(request);
  if (denied) return denied;
  return NextResponse.json({ sessions: listSessions() }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const denied = await protectedRequest(request,true);
  if (denied) return denied;
  const oversized = checkPayload(request,16000);
  if (oversized) return oversized;
  if (!limitAttempt("interview-create",12)) return NextResponse.json({error:"启动过于频繁"},{status:429});
  try {
    const raw = await request.text();
    if (raw.length > 16000) return NextResponse.json({error:"请求过长"},{status:413});
    const body = JSON.parse(raw) as {versionId?:unknown;kind?:unknown};
    if (typeof body.versionId!=="string"||body.versionId.length>100||!validKind(body.kind))
      return NextResponse.json({error:"必须选择已保存的简历版本和面试类型"},{status:400});
    const version=getInterviewContext(body.versionId);
    const question=firstQuestion(version.role,body.kind,version.snapshot,version.jd);
    const session=startSession(body.versionId,body.kind,question,getAIConfig().mode==="llm"?"llm":"mock");
    return NextResponse.json({session},{status:201});
  } catch { return NextResponse.json({error:"无法创建练习，请确认简历版本仍然存在"},{status:400}); }
}
