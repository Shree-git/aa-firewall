import { NextResponse } from "next/server";
import { apiError } from "@/server/http";
import { getAccessEndpoint } from "@/server/internal-systems";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const employeeId = url.searchParams.get("employeeId") ?? "";
    const result = getAccessEndpoint({
      employeeId,
      authorization: request.headers.get("authorization"),
      runId: url.searchParams.get("runId")
    });
    return NextResponse.json(result.body, { status: result.statusCode });
  } catch (error) {
    return apiError(error);
  }
}
