import { protectedRequest, limitAttempt, rateLimitClientKey, readLimitedJson } from "@/lib/auth";
import { NextResponse } from "next/server";
import { LLMError } from "@/lib/ai/client";
import type { FollowUpBulletRequestBody } from "@/lib/ai/types";
import { generateFollowUpBulletServer } from "@/services/ai/resumeAgent.server";

export async function POST(request: Request) {
  const forbidden=await protectedRequest(request,true);if(forbidden)return forbidden;
  if (!limitAttempt("llm:" + rateLimitClientKey(request), 10))
    return NextResponse.json({error:"每分钟 AI 请求次数已达到上限"},{status:429});
  try {
    const parsed = await readLimitedJson<FollowUpBulletRequestBody>(request, 120000, "输入内容过长", "请求格式错误");
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const { input, question, purpose, userAnswer } = body;

    if (!userAnswer?.trim()) {
      return NextResponse.json({ error: "请先填写回答" }, { status: 400 });
    }

    const { bullet, mode } = await generateFollowUpBulletServer(
      input,
      question,
      purpose,
      userAnswer
    );
    return NextResponse.json({ bullet, mode });
  } catch (error) {
    const message = error instanceof LLMError ? error.message : "Bullet 生成失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
