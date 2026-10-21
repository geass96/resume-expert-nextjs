import { NextResponse } from "next/server";
import { protectedRequest, readLimitedJson } from "@/lib/auth";
import { CardsConflictError, updateCardProgress } from "@/lib/knowledge-cards";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await protectedRequest(request, true); if (denied) return denied;
  const parsed = await readLimitedJson<unknown>(request, 220000, "项目回答过长");
  if (!parsed.ok) return parsed.response;
  try {
    return NextResponse.json(updateCardProgress((await context.params).id, parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const conflict = error instanceof CardsConflictError;
    return NextResponse.json({ error: conflict ? error.message : "无法保存，请检查卡片、评分及回答长度" },
      { status: conflict ? 409 : 400, headers: { "Cache-Control": "no-store" } });
  }
}
