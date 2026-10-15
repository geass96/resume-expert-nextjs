import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
 return NextResponse.json({ok:true,version:"0.2.0",commit:process.env.RESUME_COMMIT||"unknown"},{headers:{"Cache-Control":"no-store"}});
}
