import crypto from "node:crypto";
import { Capability, CapabilitySchema, PlanStep, PolicyDecision, Actor, ToolCall } from "./schemas";
import { canonicalJson, newId, nowIso } from "./id";

const CAPABILITY_TTL_MS = 10 * 60 * 1000;

const secret = process.env.CAPABILITY_SECRET ?? "aa-firewall-demo-secret";

export function evaluatePolicy(actor: Actor, step: PlanStep): PolicyDecision {
  if (actor.role === "security_auditor") {
    return {
      allowed: step.kind === "read" || step.action === "generate_report",
      reason: step.kind === "read" ? "Auditors may inspect read/report actions." : "Auditors cannot execute write actions.",
      requiresApproval: false
    };
  }

  if (actor.role === "employee") {
    return {
      allowed: false,
      reason: "Employees cannot run access cleanup workflows.",
      requiresApproval: false
    };
  }

  if (actor.role === "manager" && step.kind === "write") {
    return {
      allowed: false,
      reason: "Managers may review transfer context but cannot revoke access.",
      requiresApproval: false
    };
  }

  if (actor.role === "manager") {
    return {
      allowed: step.kind === "read" || step.action === "generate_report",
      reason: "Managers may read context and generate reports.",
      requiresApproval: false
    };
  }

  if (actor.role === "it_admin") {
    return {
      allowed: true,
      reason: step.kind === "write" ? "IT admin write requires human approval." : "IT admin may perform workflow read actions.",
      requiresApproval: step.kind === "write" || step.approvalRequired
    };
  }

  return {
    allowed: false,
    reason: "Unknown role denied by default.",
    requiresApproval: false
  };
}

export function mintCapability(params: {
  runId: string;
  actor: Actor;
  step: PlanStep;
  approvalId?: string;
}): Capability {
  const scope: Capability["scope"] = params.step.kind === "write" ? "write" : "read";
  const unsigned = {
    id: newId("cap"),
    runId: params.runId,
    tool: params.step.tool,
    action: params.step.action,
    resource: params.step.resource,
    scope,
    actorId: params.actor.id,
    expiresAt: new Date(Date.now() + CAPABILITY_TTL_MS).toISOString(),
    approvalId: params.approvalId
  };
  const signature = sign(unsigned);
  return CapabilitySchema.parse({ ...unsigned, signature });
}

export function verifyCapability(capability: Capability, call: Pick<ToolCall, "tool" | "action"> & { resource?: string; scope?: Capability["scope"] }): {
  ok: boolean;
  reason: string;
} {
  const parsed = CapabilitySchema.safeParse(capability);
  if (!parsed.success) {
    return { ok: false, reason: "Capability schema invalid." };
  }
  const { signature, ...unsigned } = capability;
  const expected = sign(unsigned);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return { ok: false, reason: "Capability signature mismatch." };
  }
  if (Date.parse(capability.expiresAt) < Date.now()) {
    return { ok: false, reason: "Capability expired." };
  }
  if (capability.tool !== call.tool || capability.action !== call.action) {
    return { ok: false, reason: "Capability does not match requested tool/action." };
  }
  if (call.resource && capability.resource !== call.resource) {
    return { ok: false, reason: "Capability does not match requested resource." };
  }
  if (call.scope && capability.scope !== call.scope) {
    return { ok: false, reason: "Capability does not match requested scope." };
  }
  return { ok: true, reason: "Capability valid." };
}

function sign(value: Omit<Capability, "signature">): string {
  return crypto.createHmac("sha256", secret).update(canonicalJson(value)).digest("hex");
}

export function explainCapability(capability: Capability): string {
  return `${capability.scope}:${capability.tool}:${capability.action}:${capability.resource} expires ${capability.expiresAt}`;
}

export function makeAuditActor(role: Actor["role"]): Actor {
  const names: Record<Actor["role"], string> = {
    it_admin: "Jordan Lee",
    manager: "Priya Shah",
    employee: "Alex Chen",
    security_auditor: "Morgan Patel"
  };
  return { id: `actor_${role}`, name: names[role], role };
}

export function rejectedCapability(runId: string, actor: Actor, step: PlanStep): Capability {
  const expired = {
    id: newId("cap"),
    runId,
    tool: step.tool,
    action: step.action,
    resource: step.resource,
    scope: (step.kind === "write" ? "write" : "read") as "read" | "write",
    actorId: actor.id,
    expiresAt: nowIso(),
    signature: "rejected"
  };
  return CapabilitySchema.parse(expired);
}
