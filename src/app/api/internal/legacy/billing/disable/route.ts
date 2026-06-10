import { NextResponse } from "next/server";
import { apiError, readJson } from "@/server/http";
import { postLegacyBillingDisableEndpoint } from "@/server/internal-systems";

export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { employeeId?: string; dryRun?: boolean; runId?: string };
    const result = postLegacyBillingDisableEndpoint({
      employeeId: body.employeeId ?? "",
      authorization: request.headers.get("authorization"),
      runId: body.runId,
      dryRun: body.dryRun
    });
    return NextResponse.json(result.body, { status: result.statusCode });
  } catch (error) {
    return apiError(error);
  }
}
