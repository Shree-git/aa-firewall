import { describe, expect, it } from "vitest";
import { verifyAudit } from "@/server/audit";
import { all } from "@/server/db";
import { DEFAULT_PROMPT, approveRun, retryRun, startRun } from "@/server/workflow";

describe("AA Firewall workflow", () => {
  it("runs the happy path and changes seeded state once per write", async () => {
    let snapshot = await startRun({ prompt: DEFAULT_PROMPT, actorRole: "it_admin", scenario: "happy_path" });
    expect(snapshot.state).toBe("awaiting_approval");
    expect(snapshot.approvals.length).toBeGreaterThan(0);

    snapshot = approveRun(snapshot.runId!);
    expect(snapshot.state).toBe("completed");
    expect(snapshot.finalReport).toContain("offboarding completed");
    expect(all("SELECT * FROM tickets WHERE owner_id = ?", ["emp_alex"])).toHaveLength(0);
    expect(all("SELECT * FROM access_grants WHERE employee_id = ? AND status = 'active'", ["emp_alex"])).toHaveLength(0);
    expect(verifyAudit(snapshot.runId!).ok).toBe(true);
    expect(snapshot.evidence?.toolCalls.length).toBeGreaterThan(0);
  });

  it("denies unauthorized roles before destructive capabilities mint", async () => {
    const snapshot = await startRun({ prompt: DEFAULT_PROMPT, actorRole: "employee", scenario: "happy_path" });
    expect(snapshot.state).toBe("blocked");
    expect(snapshot.blockedReason).toContain("Employees cannot run");
    expect(snapshot.evidence?.capabilities).toHaveLength(0);
  });

  it("pauses on REST timeout after write and retries without duplicate writes", async () => {
    let snapshot = await startRun({ prompt: DEFAULT_PROMPT, actorRole: "it_admin", scenario: "rest_failure" });
    snapshot = approveRun(snapshot.runId!);
    expect(snapshot.state).toBe("paused");
    expect(snapshot.connectorActivity.some((item) => item.status === "failed")).toBe(true);
    const ticketOps = all("SELECT * FROM operations WHERE idempotency_key LIKE ?", [`${snapshot.runId}:%transfer_ticket_ownership`]);
    expect(ticketOps).toHaveLength(1);

    snapshot = retryRun(snapshot.runId!);
    expect(snapshot.state).toBe("completed");
    const ticketOpsAfter = all("SELECT * FROM operations WHERE idempotency_key LIKE ?", [`${snapshot.runId}:%transfer_ticket_ownership`]);
    expect(ticketOpsAfter).toHaveLength(1);
  });

  it("keeps prompt-injection content as data only", async () => {
    let snapshot = await startRun({ prompt: DEFAULT_PROMPT, actorRole: "it_admin", scenario: "prompt_injection" });
    snapshot = approveRun(snapshot.runId!);
    const auditText = JSON.stringify(snapshot.auditEvents);
    expect(auditText).toContain("malicious seeded note");
    expect(auditText).not.toContain("revoke_ceo");
    expect(snapshot.plan?.steps.some((step) => step.resource.includes("ceo"))).toBe(false);
  });
});
