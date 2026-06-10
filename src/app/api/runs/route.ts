import { NextResponse } from "next/server";
import { apiError, readJson } from "@/server/http";
import { StartRunRequestSchema } from "@/server/schemas";
import { DEMO_SESSION_COOKIE, mintDemoSession } from "@/server/session";
import { makeAuditActor } from "@/server/security";
import { startRun } from "@/server/workflow";

export async function POST(request: Request) {
  try {
    const body = StartRunRequestSchema.parse(await readJson(request));
    const actor = makeAuditActor(body.actorRole);
    const snapshot = await startRun({ prompt: body.prompt, scenario: body.scenario }, actor);
    const response = NextResponse.json(snapshot);
    response.cookies.set(DEMO_SESSION_COOKIE, mintDemoSession(body.actorRole), {
      httpOnly: true,
      maxAge: 8 * 60 * 60,
      path: "/",
      sameSite: "lax"
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
