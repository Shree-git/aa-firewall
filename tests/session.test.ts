import { describe, expect, it } from "vitest";
import { mintDemoSession, verifyDemoSession } from "@/server/session";

describe("signed demo sessions", () => {
  it("accepts a fresh signed session", () => {
    const token = mintDemoSession("it_admin", 1_000);
    expect(verifyDemoSession(token, 2_000)).toMatchObject({ ok: true, actor: { role: "it_admin" } });
  });

  it("rejects missing, tampered, and expired sessions", () => {
    expect(verifyDemoSession(undefined)).toMatchObject({ ok: false, reason: "Missing signed demo session." });

    const token = mintDemoSession("manager", 1_000);
    expect(verifyDemoSession(`${token.slice(0, -1)}x`, 2_000)).toMatchObject({ ok: false });
    expect(verifyDemoSession(token, 9 * 60 * 60 * 1_000)).toMatchObject({ ok: false, reason: "Signed demo session expired." });
  });
});
