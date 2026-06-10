import { NextResponse } from "next/server";
import { apiError } from "@/server/http";
import { getTicketsEndpoint } from "@/server/internal-systems";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const owner = url.searchParams.get("owner") ?? "";
    const result = getTicketsEndpoint({
      owner,
      authorization: request.headers.get("authorization"),
      runId: url.searchParams.get("runId")
    });
    return NextResponse.json(result.body, { status: result.statusCode });
  } catch (error) {
    return apiError(error);
  }
}
