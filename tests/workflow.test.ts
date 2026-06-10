import { describe, expect, it } from "vitest";
import { simulateNextAuditFailureForTest, verifyAudit } from "@/server/audit";
import { all } from "@/server/db";
import { makeAuditActor } from "@/server/security";
import { DEFAULT_PROMPT, approveRun, retryRun, startRun } from "@/server/workflow";

describe("AA Firewall workflow", () => {
  const itAdmin = makeAuditActor("it_admin");
  const employee = makeAuditActor("employee");

  it("runs the happy path and changes seeded state once per write", async () => {
    let snapshot = await startRun({ prompt: DEFAULT_PROMPT, scenario: "happy_path" }, itAdmin);
    expect(snapshot.state).toBe("awaiting_approval");
    expect(snapshot.approvals.length).toBeGreaterThan(0);

    snapshot = approveRun(snapshot.runId!, itAdmin);
    expect(snapshot.state).toBe("completed");
    expect(snapshot.finalReport).toContain("offboarding completed");
    expect(all("SELECT * FROM tickets WHERE owner_id = ?", ["emp_alex"])).toHaveLength(0);
    expect(all("SELECT * FROM access_grants WHERE employee_id = ? AND status = 'active'", ["emp_alex"])).toHaveLength(0);
    expect(verifyAudit(snapshot.runId!).ok).toBe(true);
    expect(snapshot.evidence?.toolCalls.length).toBeGreaterThan(0);
    expect(snapshot.evidence?.auditEvents.length).toBe(snapshot.auditEvents.length);
    expect(snapshot.evidence?.stateDiffs.some((diff) => diff.before !== undefined && diff.after !== undefined)).toBe(true);
  });

  it("denies unauthorized roles before destructive capabilities mint", async () => {
    const snapshot = await startRun({ prompt: DEFAULT_PROMPT, scenario: "happy_path" }, employee);
    expect(snapshot.state).toBe("blocked");
    expect(snapshot.blockedReason).toContain("Employees cannot run");
    expect(snapshot.evidence?.capabilities).toHaveLength(0);
  });

  it("pauses on REST timeout after write and retries without duplicate writes", async () => {
    let snapshot = await startRun({ prompt: DEFAULT_PROMPT, scenario: "rest_failure" }, itAdmin);
    snapshot = approveRun(snapshot.runId!, itAdmin);
    expect(snapshot.state).toBe("paused");
    expect(snapshot.connectorActivity.some((item) => item.status === "failed")).toBe(true);
    const ticketOps = all("SELECT * FROM operations WHERE idempotency_key LIKE ?", [`${snapshot.runId}:%transfer_ticket_ownership`]);
    expect(ticketOps).toHaveLength(1);

    snapshot = retryRun(snapshot.runId!, itAdmin);
    expect(snapshot.state).toBe("completed");
    expect(snapshot.connectorActivity.some((item) => item.status === "recovered")).toBe(true);
    const ticketOpsAfter = all("SELECT * FROM operations WHERE idempotency_key LIKE ?", [`${snapshot.runId}:%transfer_ticket_ownership`]);
    expect(ticketOpsAfter).toHaveLength(1);
  });

  it("keeps prompt-injection content as data only", async () => {
    let snapshot = await startRun({ prompt: DEFAULT_PROMPT, scenario: "prompt_injection" }, itAdmin);
    snapshot = approveRun(snapshot.runId!, itAdmin);
    const auditText = JSON.stringify(snapshot.auditEvents);
    expect(auditText).toContain("malicious seeded note");
    expect(auditText).not.toContain("revoke_ceo");
    expect(snapshot.plan?.steps.some((step) => step.resource.includes("ceo"))).toBe(false);
  });

  it("keeps batch approval duplicate submits idempotent", async () => {
    let snapshot = await startRun({ prompt: DEFAULT_PROMPT, scenario: "happy_path" }, itAdmin);
    snapshot = approveRun(snapshot.runId!, itAdmin);
    const operationsAfterFirstSubmit = all("SELECT * FROM operations");

    snapshot = approveRun(snapshot.runId!, itAdmin);
    expect(snapshot.state).toBe("completed");
    expect(all("SELECT * FROM operations")).toHaveLength(operationsAfterFirstSubmit.length);
  });

  it("rolls back connector mutation and idempotency record when audit append fails", async () => {
    let snapshot = await startRun({ prompt: DEFAULT_PROMPT, scenario: "happy_path" }, itAdmin);
    simulateNextAuditFailureForTest("tool_result");
    snapshot = approveRun(snapshot.runId!, itAdmin);

    expect(snapshot.state).toBe("paused");
    expect(all("SELECT * FROM tickets WHERE owner_id = ?", ["emp_alex"])).toHaveLength(2);
    expect(all("SELECT * FROM operations WHERE idempotency_key LIKE ?", [`${snapshot.runId}:%transfer_ticket_ownership`])).toHaveLength(0);
  });
});
