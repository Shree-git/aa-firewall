import { NextResponse } from "next/server";
import { exportEvidence } from "@/server/evidence";

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  return NextResponse.json(exportEvidence(runId));
}
