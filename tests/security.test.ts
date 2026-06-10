import { describe, expect, it } from "vitest";
import { getFallbackPlan } from "@/server/planner";
import { evaluatePolicy, makeAuditActor, mintCapability, verifyCapability } from "@/server/security";

describe("policy and capabilities", () => {
  it("allows it_admin reads and requires approval for writes", () => {
    const actor = makeAuditActor("it_admin");
    const [readStep] = getFallbackPlan().steps;
    const writeStep = getFallbackPlan().steps.find((step) => step.kind === "write");

    expect(evaluatePolicy(actor, readStep)).toMatchObject({ allowed: true, requiresApproval: false });
    expect(evaluatePolicy(actor, writeStep!)).toMatchObject({ allowed: true, requiresApproval: true });
  });

  it("denies destructive employee and manager write actions", () => {
    const writeStep = getFallbackPlan().steps.find((step) => step.kind === "write")!;
    expect(evaluatePolicy(makeAuditActor("employee"), writeStep).allowed).toBe(false);
    expect(evaluatePolicy(makeAuditActor("manager"), writeStep).allowed).toBe(false);
  });

  it("verifies signed capabilities and rejects tampering", () => {
    const actor = makeAuditActor("it_admin");
    const step = getFallbackPlan().steps.find((item) => item.kind === "write")!;
    const capability = mintCapability({ runId: "run_test", actor, step, approvalId: "approval_test" });

    expect(verifyCapability(capability, { tool: step.tool, action: step.action, resource: step.resource, scope: "write" })).toMatchObject({ ok: true });
    expect(
      verifyCapability({ ...capability, resource: "saas:other" }, { tool: step.tool, action: step.action, resource: step.resource })
    ).toMatchObject({ ok: false });
    expect(verifyCapability(capability, { tool: step.tool, action: step.action, resource: step.resource, scope: "read" })).toMatchObject({
      ok: false,
      reason: "Capability does not match requested scope."
    });
  });
});
