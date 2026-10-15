import { NextResponse } from "next/server";
import { getPublicAIStatus } from "@/lib/ai/config";
import { protectedRequest } from "@/lib/auth";
export async function GET(request:Request) {
  const forbidden=await protectedRequest(request);if(forbidden)return forbidden;
  return NextResponse.json(getPublicAIStatus());
}
