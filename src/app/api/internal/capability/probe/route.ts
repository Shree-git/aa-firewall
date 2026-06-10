import { NextResponse } from "next/server";
import { apiError, HttpError, readJson } from "@/server/http";
import { getInternalSystemSnapshot, runCapabilityProbe } from "@/server/internal-systems";
import { requireDemoSession } from "@/server/session";
import { getSnapshot } from "@/server/workflow";

export async function POST(request: Request) {
  try {
    const actor = requireDemoSession(request);
    const body = (await readJson(request)) as { runId?: string };
    if (!body.runId) throw new HttpError(400, "RUN_REQUIRED", "Capability probe requires a runId.");
    const snapshot = getSnapshot(body.runId);
    if (snapshot.actor?.id !== actor.id) throw new HttpError(403, "ACTOR_FORBIDDEN", "Signed demo session actor is not authorized for this run.");
    const results = runCapabilityProbe(body.runId);
    return NextResponse.json({ results, snapshot: getInternalSystemSnapshot(body.runId) });
  } catch (error) {
    return apiError(error);
  }
}
