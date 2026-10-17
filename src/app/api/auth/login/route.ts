import { NextResponse } from "next/server";
import { limitAttempt, newSession, originAllowed, rateLimitClientKey, readLimitedJson, setLoginCookie, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  if (!originAllowed(request)) return NextResponse.json({ error: "来源无效" }, { status: 403 });
  if (!limitAttempt("login:" + rateLimitClientKey(request), 5)) {
    return NextResponse.json({ error: "尝试次数过多" }, { status: 429 });
  }

  const parsed = await readLimitedJson<{ password?: unknown }>(request, 1024, "登录请求过大", "输入无效");
  if (!parsed.ok) return parsed.response;
  const password = parsed.data.password;
  if (typeof password !== "string" || !verifyPassword(password)) {
    return NextResponse.json({ error: "验证失败" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  setLoginCookie(response, newSession());
  return response;
}
