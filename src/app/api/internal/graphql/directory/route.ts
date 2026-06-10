import { NextResponse } from "next/server";
import { apiError, readJson } from "@/server/http";
import { postDirectoryEndpoint } from "@/server/internal-systems";

export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { query?: string; variables?: Record<string, unknown>; runId?: string };
    const result = postDirectoryEndpoint({
      authorization: request.headers.get("authorization"),
      query: body.query ?? "",
      variables: body.variables ?? {},
      runId: body.runId
    });
    return NextResponse.json(result.body, { status: result.statusCode });
  } catch (error) {
    return apiError(error);
  }
}
