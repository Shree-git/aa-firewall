import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: { code: error.code, message: error.message, details: error.details } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Request failed schema validation.", details: error.flatten() } },
      { status: 400 }
    );
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: { code: "BAD_JSON", message: "Request body must be valid JSON." } }, { status: 400 });
  }
  if (error instanceof Error && error.message.startsWith("Unknown run ")) {
    return NextResponse.json({ error: { code: "RUN_NOT_FOUND", message: error.message } }, { status: 404 });
  }
  const message = error instanceof Error ? error.message : "Unknown server error.";
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message } }, { status: 500 });
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SyntaxError("Bad JSON");
  }
}
