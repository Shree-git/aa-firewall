import { NextResponse } from "next/server";
import { exportEvidence } from "@/server/evidence";
import { apiError } from "@/server/http";
import { requireDemoSession } from "@/server/session";
import { getSnapshot } from "@/server/workflow";

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await context.params;
    const actor = requireDemoSession(request);
    const snapshot = getSnapshot(runId);
    if (snapshot.actor?.id !== actor.id) {
      return NextResponse.json(
        { error: { code: "ACTOR_FORBIDDEN", message: "Signed demo session actor is not authorized for this run." } },
        { status: 403 }
      );
    }
    return NextResponse.json(exportEvidence(runId));
  } catch (error) {
    return apiError(error);
  }
}
