import { NextResponse } from "next/server";
import { apiError, readJson } from "@/server/http";
import { ApprovalRequestSchema } from "@/server/schemas";
import { requireDemoSession } from "@/server/session";
import { approveRun } from "@/server/workflow";

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await context.params;
    const actor = requireDemoSession(request);
    const body = ApprovalRequestSchema.parse(await readJson(request));
    return NextResponse.json(approveRun(runId, actor, body.approve));
  } catch (error) {
    return apiError(error);
  }
}
