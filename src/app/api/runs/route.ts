import { NextResponse } from "next/server";
import { startRun } from "@/server/workflow";

export async function POST(request: Request) {
  const body = await request.json();
  const snapshot = await startRun(body);
  return NextResponse.json(snapshot);
}
