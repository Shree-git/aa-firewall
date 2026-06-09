import { NextResponse } from "next/server";
import { getSnapshot, resetDemo } from "@/server/workflow";

export async function GET() {
  return NextResponse.json(getSnapshot());
}

export async function DELETE() {
  return NextResponse.json(resetDemo());
}
