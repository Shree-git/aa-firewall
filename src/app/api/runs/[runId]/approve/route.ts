import { NextResponse } from "next/server";
import { approveRun } from "@/server/workflow";

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { approve?: boolean };
  return NextResponse.json(approveRun(runId, body.approve !== false));
}
