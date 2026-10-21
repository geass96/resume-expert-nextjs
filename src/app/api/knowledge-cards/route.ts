import { NextResponse } from "next/server";
import { protectedRequest, readLimitedJson } from "@/lib/auth";
import { CardsConflictError, importCardProgress, knowledgeCards, readCardProgress } from "@/lib/knowledge-cards";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  const denied = await protectedRequest(request); if (denied) return denied;
  try { return NextResponse.json({ cards: knowledgeCards, ...readCardProgress() }, { headers }); }
  catch { return NextResponse.json({ error: "无法读取复习记录，请稍后重试" }, { status: 500, headers }); }
}
export async function PUT(request: Request) {
  const denied = await protectedRequest(request, true); if (denied) return denied;
  const parsed = await readLimitedJson<unknown>(request, 8000000, "进度文件过大");
  if (!parsed.ok) return parsed.response;
  try { return NextResponse.json(importCardProgress(parsed.data), { headers }); }
  catch (error) {
    const conflict = error instanceof CardsConflictError;
    return NextResponse.json({ error: conflict ? error.message : "导入失败，请检查文件格式、卡片编号和字段限制" },
      { status: conflict ? 409 : 400, headers });
  }
}
