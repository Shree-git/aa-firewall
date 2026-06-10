import { NextResponse } from "next/server";
import { apiError, readJson } from "@/server/http";
import { postTicketTransferEndpoint } from "@/server/internal-systems";

export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { employeeId?: string; transferOwnerId?: string; dryRun?: boolean; runId?: string };
    const result = postTicketTransferEndpoint({
      employeeId: body.employeeId ?? "",
      transferOwnerId: body.transferOwnerId ?? "",
      authorization: request.headers.get("authorization"),
      runId: body.runId,
      dryRun: body.dryRun
    });
    return NextResponse.json(result.body, { status: result.statusCode });
  } catch (error) {
    return apiError(error);
  }
}
