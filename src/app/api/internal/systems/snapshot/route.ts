import { NextResponse } from "next/server";
import { apiError } from "@/server/http";
import { getInternalSystemSnapshot } from "@/server/internal-systems";
import { requireDemoSession } from "@/server/session";

export async function GET(request: Request) {
  try {
    requireDemoSession(request);
    const runId = new URL(request.url).searchParams.get("runId");
    return NextResponse.json(getInternalSystemSnapshot(runId));
  } catch (error) {
    return apiError(error);
  }
}
