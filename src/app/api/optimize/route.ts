import { protectedRequest,checkPayload,limitAttempt } from "@/lib/auth";
import { NextResponse } from "next/server";
import { LLMError } from "@/lib/ai/client";
import type { OptimizeRequestBody } from "@/lib/ai/types";
import { regenerateOptimizedItemsServer } from "@/services/ai/resumeAgent.server";

export async function POST(request: Request) {
  const forbidden=await protectedRequest(request,true);if(forbidden)return forbidden;
  const oversized=checkPayload(request,120000);if(oversized)return oversized;
  if(!limitAttempt("llm:"+(request.headers.get("x-forwarded-for")||"owner"),10))
    return NextResponse.json({error:"每分钟 AI 请求次数已达到上限"},{status:429});
  try {
    const body = (await request.json()) as OptimizeRequestBody;
    const { input, style } = body;

    if (!input?.originalResume?.trim() || !style) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const { optimizedItems, mode } = await regenerateOptimizedItemsServer(input, style);
    return NextResponse.json({ optimizedItems, mode });
  } catch (error) {
    const message = error instanceof LLMError ? error.message : "优化生成失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
