import { NextResponse } from "next/server";
import { apiError } from "@/server/http";
import { requireDemoSession } from "@/server/session";
import { retryRun } from "@/server/workflow";

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await context.params;
    const actor = requireDemoSession(request);
    return NextResponse.json(retryRun(runId, actor));
  } catch (error) {
    return apiError(error);
  }
}
