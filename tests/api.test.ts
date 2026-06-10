import { describe, expect, it } from "vitest";
import { POST as approvePost } from "@/app/api/runs/[runId]/approve/route";
import { GET as evidenceGet } from "@/app/api/runs/[runId]/evidence/route";
import { POST as runsPost } from "@/app/api/runs/route";
import { DEMO_SESSION_COOKIE, mintDemoSession } from "@/server/session";
import { DEFAULT_PROMPT } from "@/server/workflow";

describe("API route errors", () => {
  it("rejects bad JSON on start run", async () => {
    const response = await runsPost(new Request("http://localhost/api/runs", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "BAD_JSON" } });
  });

  it("rejects missing sessions, unknown runs, unauthorized actors, and invalid approvals", async () => {
    const missing = await approvePost(
      new Request("http://localhost/api/runs/run_missing/approve", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ runId: "run_missing" }) }
    );
    expect(missing.status).toBe(401);

    const ownerCookie = `${DEMO_SESSION_COOKIE}=${encodeURIComponent(mintDemoSession("it_admin"))}`;
    const unknown = await approvePost(
      new Request("http://localhost/api/runs/run_missing/approve", { method: "POST", headers: { cookie: ownerCookie }, body: "{}" }),
      { params: Promise.resolve({ runId: "run_missing" }) }
    );
    expect(unknown.status).toBe(404);

    const started = await runsPost(
      new Request("http://localhost/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: DEFAULT_PROMPT, actorRole: "it_admin", scenario: "happy_path" })
      })
    );
    const snapshot = await started.json();
    const employeeCookie = `${DEMO_SESSION_COOKIE}=${encodeURIComponent(mintDemoSession("employee"))}`;
    const unauthorized = await approvePost(
      new Request(`http://localhost/api/runs/${snapshot.runId}/approve`, { method: "POST", headers: { cookie: employeeCookie }, body: "{}" }),
      { params: Promise.resolve({ runId: snapshot.runId }) }
    );
    expect(unauthorized.status).toBe(403);

    const invalidApproval = await approvePost(
      new Request(`http://localhost/api/runs/${snapshot.runId}/approve`, {
        method: "POST",
        headers: { cookie: ownerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ approve: "yes" })
      }),
      { params: Promise.resolve({ runId: snapshot.runId }) }
    );
    expect(invalidApproval.status).toBe(400);

    const forbiddenEvidence = await evidenceGet(
      new Request(`http://localhost/api/runs/${snapshot.runId}/evidence`, { headers: { cookie: employeeCookie } }),
      { params: Promise.resolve({ runId: snapshot.runId }) }
    );
    expect(forbiddenEvidence.status).toBe(403);
  });
});
