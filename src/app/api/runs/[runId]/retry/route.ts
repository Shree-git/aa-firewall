import { NextResponse } from "next/server";
import { retryRun } from "@/server/workflow";

export async function POST(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  return NextResponse.json(retryRun(runId));
}
