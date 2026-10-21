import { protectedRequest, limitAttempt, rateLimitClientKey, readLimitedJson } from "@/lib/auth";
import { NextResponse } from "next/server";
import { LLMError } from "@/lib/ai/client";
import type { AnalyzeRequestBody } from "@/lib/ai/types";
import { analyzeResumeServer } from "@/services/ai/resumeAgent.server";
import { streamJSON } from "@/lib/ai/stream-json";

export async function POST(request: Request) {
  const forbidden=await protectedRequest(request,true);if(forbidden)return forbidden;
  if (!limitAttempt("llm:" + rateLimitClientKey(request), 10))
    return NextResponse.json({error:"每分钟 AI 请求次数已达到上限"},{status:429});
  try {
    const parsed = await readLimitedJson<AnalyzeRequestBody>(request, 120000, "输入内容过长", "请求格式错误");
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const { input, optimizeStyle = "ai-product" } = body;

    if (!input?.targetRole?.trim() || !input?.jobDescription?.trim() || !input?.originalResume?.trim()) {
      return NextResponse.json({ error: "请填写目标岗位、JD 和原始简历" }, { status: 400 });
    }

    return streamJSON(async()=>{
      try {
        const { result, mode } = await analyzeResumeServer(input, optimizeStyle);
        return { result, mode };
      } catch(error) {
        const message=error instanceof LLMError || error instanceof Error && error.message.startsWith("模型返回结构无效：")
          ?error.message:"分析失败，请稍后重试";
        console.error("[analyze] inference_failed",{status:error instanceof LLMError?error.status:undefined});
        return {error:message};
      }
    });
  } catch (error) {
    const message =
      error instanceof LLMError
        ? error.message
        : "分析失败，请稍后重试";
    console.error("[analyze] request_failed",{status:error instanceof LLMError?error.status:undefined});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
