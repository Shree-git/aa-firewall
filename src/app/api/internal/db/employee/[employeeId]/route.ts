import { NextResponse } from "next/server";
import { apiError } from "@/server/http";
import { getEmployeeEndpoint } from "@/server/internal-systems";

export async function GET(request: Request, context: { params: Promise<{ employeeId: string }> }) {
  try {
    const { employeeId } = await context.params;
    const result = getEmployeeEndpoint({
      employeeId,
      authorization: request.headers.get("authorization"),
      runId: new URL(request.url).searchParams.get("runId")
    });
    return NextResponse.json(result.body, { status: result.statusCode });
  } catch (error) {
    return apiError(error);
  }
}
