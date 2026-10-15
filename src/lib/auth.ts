import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
const COOKIE = "resume_session";
const MAX_AGE = 7 * 24 * 3600;
function secret() { return process.env.RESUME_SESSION_SECRET || ""; }
function signature(payload: string) { return createHmac("sha256", secret()).update(payload).digest("hex"); }
export function newSession() {
  if (secret().length < 32) throw new Error("Session secret not configured");
  const payload = Date.now() + "." + randomBytes(12).toString("hex");
  return payload + "." + signature(payload);
}
export function validSession(token: string | undefined): boolean {
  if (!token || secret().length < 32) return false;
  const split = token.lastIndexOf(".");
  if (split < 0) return false;
  const payload = token.slice(0, split), mac = token.slice(split + 1);
  if (!/^[a-f0-9]{64}$/.test(mac)) return false;
  const issued = Number(payload.split(".")[0]);
  if (!Number.isFinite(issued) || issued > Date.now() + 60000 || Date.now() - issued > MAX_AGE*1000) return false;
  return timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(signature(payload), "hex"));
}
export async function isAuthenticated() { return validSession((await cookies()).get(COOKIE)?.value); }
export function verifyPassword(candidate: string): boolean {
  const salt = process.env.RESUME_PASSWORD_SALT, hash = process.env.RESUME_PASSWORD_HASH;
  if (!salt || !/^[a-f0-9]{64}$/.test(hash || "") || !candidate || candidate.length > 256) return false;
  return timingSafeEqual(scryptSync(candidate, salt, 32), Buffer.from(hash!, "hex"));
}
export function setLoginCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE, token, {httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:MAX_AGE});
}
export function clearLoginCookie(response: NextResponse) {
  response.cookies.set(COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:0});
}
export function originAllowed(request: Request): boolean {
  const expected = process.env.RESUME_PUBLIC_ORIGIN || new URL(request.url).origin;
  return request.headers.get("origin") === expected;
}
const attempts = new Map<string, {n:number;expires:number}>();
export function limitAttempt(key:string,max=12) {
  const now=Date.now(),old=attempts.get(key);
  const next=!old||old.expires<now ? {n:1,expires:now+60000}:{n:old.n+1,expires:old.expires};
  attempts.set(key,next);
  if(attempts.size>3000)for(const [k,v] of attempts)if(v.expires<now)attempts.delete(k);
  return next.n<=max;
}
export async function protectedRequest(request:Request,write=false): Promise<NextResponse|null> {
  if(!(await isAuthenticated()))return NextResponse.json({error:"请先登录"},{status:401});
  if(write&&!originAllowed(request))return NextResponse.json({error:"请求来源无效"},{status:403});
  if(!limitAttempt("api:"+(request.headers.get("x-forwarded-for")||"owner"),120))
    return NextResponse.json({error:"请求过于频繁"},{status:429});
  return null;
}
export function checkPayload(request:Request,maximum=100000):NextResponse|null {
  if(Number(request.headers.get("content-length")||0)>maximum)
    return NextResponse.json({error:"输入内容过长"},{status:413});
  return null;
}
