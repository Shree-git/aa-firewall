import { NextResponse } from "next/server";
import { apiError } from "@/server/http";
import { DEMO_SESSION_COOKIE, mintDemoSession, readCookie, requireDemoSession } from "@/server/session";
import { getSnapshot, resetDemo } from "@/server/workflow";

export async function GET(request: Request) {
  try {
    const response = NextResponse.json(getSnapshot());
    if (!readCookie(request, DEMO_SESSION_COOKIE)) {
      response.cookies.set(DEMO_SESSION_COOKIE, mintDemoSession("it_admin"), {
        httpOnly: true,
        maxAge: 8 * 60 * 60,
        path: "/",
        sameSite: "lax"
      });
    }
    return response;
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    requireDemoSession(request);
    return NextResponse.json(resetDemo());
  } catch (error) {
    return apiError(error);
  }
}
