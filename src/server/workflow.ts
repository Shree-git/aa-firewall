import { appendAudit, auditDigest, listAudit } from "./audit";
import { executeConnector, listActivity, recordActivity } from "./connectors";
import { all, get, getDb, run } from "./db";
import { exportEvidence } from "./evidence";
import { HttpError } from "./http";
import { newId, nowIso } from "./id";
import { createPlan } from "./planner";
import { evaluatePolicy, mintCapability, verifyCapability } from "./security";
import {
  Actor,
  AgentPlan,
  Approval,
  ApprovalSchema,
  CapabilitySchema,
  DemoSnapshot,
  DemoSnapshotSchema,
  PlanStep,
  PolicyDecisionSchema,
  StateDiffSchema,
  StartRunInput,
  StartRunInputSchema,
  ToolCall,
  ToolCallSchema
} from "./schemas";

export const DEFAULT_PROMPT =
  "Offboard Alex Chen effective today: find all systems Alex has access to, check open customer escalations, transfer ownership to Priya Shah, revoke SaaS and database access, disable legacy billing access, and produce an audit report.";

export async function startRun(input: StartRunInput, actor: Actor): Promise<DemoSnapshot> {
  const parsed = StartRunInputSchema.parse(input);
  const runId = newId("run");
  const createdAt = nowIso();
  run(
    "INSERT INTO runs (id, actor_id, actor_name, actor_role, prompt, scenario, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [runId, actor.id, actor.name, actor.role, parsed.prompt, parsed.scenario, "created", createdAt, createdAt]
  );
  appendAudit({
    runId,
    type: "run_created",
    actorId: actor.id,
    payloadRedacted: { role: actor.role, scenario: parsed.scenario }
  });

  updateState(runId, "planning");
  const { plan, source, error } = await createPlan(parsed.prompt);
  run("UPDATE runs SET plan_json = ?, updated_at = ? WHERE id = ?", [JSON.stringify(plan), nowIso(), runId]);
  appendAudit({
    runId,
    type: "plan_created",
    actorId: actor.id,
    payloadRedacted: { source, error, stepCount: plan.steps.length },
    resultDigest: auditDigest(plan)
  });

  const blocked = await executeReadPhase(runId, actor, plan);
  if (blocked) return getSnapshot(runId);

  const pendingWriteSteps = plan.steps.filter((step) => step.kind === "write");
  if (pendingWriteSteps.length > 0) {
    for (const step of pendingWriteSteps) createApproval(runId, actor.id, step.id);
    updateState(runId, "awaiting_approval");
    appendAudit({
      runId,
      type: "approval_requested",
      actorId: actor.id,
      decision: "pending",
      payloadRedacted: { steps: pendingWriteSteps.map((step) => step.id) }
    });
  }

  return getSnapshot(runId);
}

export function approveRun(runId: string, actor: Actor, approve = true): DemoSnapshot {
  const runRow = requireRun(runId);
  assertRunActor(runRow, actor);
  if (runRow.state === "completed" || runRow.state === "denied" || runRow.state === "blocked") {
    return getSnapshot(runId);
  }
  const pending = get<{ count: number }>("SELECT COUNT(*) as count FROM approvals WHERE run_id = ? AND status = 'pending'", [runId])?.count ?? 0;
  if (pending === 0) {
    throw new HttpError(409, "APPROVAL_NOT_PENDING", "Run does not have a pending approval batch.");
  }
  const status = approve ? "approved" : "denied";
  run("UPDATE approvals SET status = ?, decided_at = ? WHERE run_id = ? AND status = 'pending'", [status, nowIso(), runId]);
  appendAudit({
    runId,
    type: approve ? "approval_granted" : "approval_denied",
    actorId: actor.id,
    decision: approve ? "allow" : "deny",
    payloadRedacted: { status, count: pending, mode: "batch" }
  });
  if (!approve) {
    updateState(runId, "denied");
    return getSnapshot(runId);
  }
  executeWritePhase(runId, actor);
  return getSnapshot(runId);
}

export function retryRun(runId: string, actor: Actor): DemoSnapshot {
  const runRow = requireRun(runId);
  assertRunActor(runRow, actor);
  if (runRow.state !== "paused") {
    return getSnapshot(runId);
  }
  updateState(runId, "retrying");
  appendAudit({
    runId,
    type: "workflow_retrying",
    actorId: String(runRow.actor_id),
    payloadRedacted: { note: "Retrying paused step with original idempotency keys." }
  });
  executeWritePhase(runId, actor, true);
  return getSnapshot(runId);
}

export function resetDemo(): DemoSnapshot {
  getDb().exec(`
    DELETE FROM runs;
    DELETE FROM approvals;
    DELETE FROM capabilities;
    DELETE FROM tool_calls;
    DELETE FROM connector_activity;
    DELETE FROM audit_events;
    DELETE FROM operations;
    DELETE FROM internal_call_frames;
    DELETE FROM capability_probe_results;
    UPDATE employees SET status = 'active' WHERE id = 'emp_alex';
    UPDATE access_grants SET status = 'active' WHERE employee_id = 'emp_alex';
    UPDATE tickets SET owner_id = 'emp_alex' WHERE id IN ('ticket_1942', 'ticket_2047');
    UPDATE legacy_billing SET status = 'active' WHERE employee_id = 'emp_alex';
  `);
  return emptySnapshot();
}

async function executeReadPhase(runId: string, actor: Actor, plan: AgentPlan): Promise<boolean> {
  for (const step of plan.steps.filter((item) => item.kind === "read")) {
    const decision = evaluatePolicy(actor, step);
    appendAudit({
      runId,
      type: "policy_decision",
      actorId: actor.id,
      tool: step.tool,
      action: step.action,
      resource: step.resource,
      decision: decision.allowed ? "allow" : "deny",
      payloadRedacted: decision
    });
    if (!decision.allowed) {
      run("UPDATE runs SET state = 'blocked', blocked_reason = ?, updated_at = ? WHERE id = ?", [decision.reason, nowIso(), runId]);
      recordActivity({ runId, tool: step.tool, action: step.action, id: step.id }, "blocked", decision.reason);
      return true;
    }
    const capability = mintCapability({ runId, actor, step });
    persistCapability(runId, capability);
    executeStep(runId, actor.id, step, capability);
  }
  return false;
}

function executeWritePhase(runId: string, actor: Actor, retry = false): void {
  const runRow = requireRun(runId);
  assertRunActor(runRow, actor);
  const plan = JSON.parse(String(runRow.plan_json)) as AgentPlan;
  updateState(runId, "executing");
  for (const step of plan.steps.filter((item) => item.kind === "write")) {
    const completed = get<{ count: number }>(
      "SELECT COUNT(*) as count FROM operations WHERE idempotency_key = ?",
      [idempotencyKey(runId, step)]
    );
    if (completed?.count && !retry) continue;

    const approval = getApproval(runId, step.id);
    if (!approval || approval.status !== "approved") {
      updateState(runId, "blocked", "Write step missing approval.");
      return;
    }
    const decision = evaluatePolicy(actor, step);
    appendAudit({
      runId,
      type: "policy_decision",
      actorId: actor.id,
      tool: step.tool,
      action: step.action,
      resource: step.resource,
      decision: decision.allowed ? "allow" : "deny",
      payloadRedacted: decision
    });
    if (!decision.allowed) {
      updateState(runId, "blocked", decision.reason);
      recordActivity({ runId, tool: step.tool, action: step.action, id: step.id }, "blocked", decision.reason);
      return;
    }
    const capability = mintCapability({ runId, actor, step, approvalId: approval.id });
    persistCapability(runId, capability);
    try {
      executeStep(runId, actor.id, step, capability);
    } catch {
      updateState(runId, "paused", "Connector failure recorded. Retry can resume with the same idempotency key.");
      return;
    }
  }
  if (!executeReportPhase(runId, actor, plan)) return;
  const finalReport =
    "Alex Chen offboarding completed. Tickets transferred to Priya Shah, SaaS/database grants revoked, legacy billing disabled, and evidence packet verified.";
  run("UPDATE runs SET final_report = ?, state = 'completed', updated_at = ? WHERE id = ?", [finalReport, nowIso(), runId]);
  appendAudit({
    runId,
    type: "run_completed",
    actorId: actor.id,
    payloadRedacted: { finalReport }
  });
}

function executeReportPhase(runId: string, actor: Actor, plan: AgentPlan): boolean {
  const step = plan.steps.find((item) => item.kind === "report");
  if (!step) return true;
  const completed = get<{ count: number }>("SELECT COUNT(*) as count FROM operations WHERE idempotency_key = ?", [idempotencyKey(runId, step)]);
  if (completed?.count) return true;

  const decision = evaluatePolicy(actor, step);
  appendAudit({
    runId,
    type: "policy_decision",
    actorId: actor.id,
    tool: step.tool,
    action: step.action,
    resource: step.resource,
    decision: decision.allowed ? "allow" : "deny",
    payloadRedacted: decision
  });
  if (!decision.allowed) {
    updateState(runId, "blocked", decision.reason);
    recordActivity({ runId, tool: step.tool, action: step.action, id: step.id }, "blocked", decision.reason);
    return false;
  }
  const capability = mintCapability({ runId, actor, step });
  persistCapability(runId, capability);
  try {
    executeStep(runId, actor.id, step, capability);
    return true;
  } catch {
    updateState(runId, "paused", "Report generation failed after connector execution.");
    return false;
  }
}

function executeStep(runId: string, actorId: string, step: PlanStep, capability: ReturnType<typeof mintCapability>): void {
  const call = ToolCallSchema.parse({
    runId,
    tool: step.tool,
    action: step.action,
    input: buildConnectorInput(step),
    capability,
    idempotencyKey: idempotencyKey(runId, step),
    purpose: step.purpose
  });
  const verified = verifyCapability(capability, {
    tool: call.tool,
    action: call.action,
    resource: step.resource,
    scope: step.kind === "write" ? "write" : "read"
  });
  if (!verified.ok) {
    appendAudit({
      runId,
      type: "capability_invalid",
      actorId,
      tool: step.tool,
      action: step.action,
      resource: step.resource,
      decision: "deny",
      payloadRedacted: { reason: verified.reason },
      idempotencyKey: call.idempotencyKey
    });
    throw new Error(verified.reason);
  }
  run("INSERT INTO tool_calls (id, run_id, payload_json) VALUES (?, ?, ?)", [newId("toolcall"), runId, JSON.stringify(call)]);
  appendAudit({
    runId,
    type: "tool_call",
    actorId,
    tool: step.tool,
    action: step.action,
    resource: step.resource,
    decision: "allow",
    payloadRedacted: { purpose: step.purpose, capability: capability.id },
    idempotencyKey: call.idempotencyKey
  });
  executeConnector(call, actorId, String(requireRun(runId).scenario));
}

function createApproval(runId: string, actorId: string, stepId: string): Approval {
  const existing = getApproval(runId, stepId);
  if (existing) return existing;
  const approval = ApprovalSchema.parse({
    id: newId("approval"),
    runId,
    stepId,
    actorId,
    status: "pending",
    createdAt: nowIso()
  });
  run("INSERT INTO approvals (id, run_id, step_id, actor_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
    approval.id,
    runId,
    stepId,
    actorId,
    approval.status,
    approval.createdAt
  ]);
  return approval;
}

function getApproval(runId: string, stepId: string): Approval | undefined {
  const row = get<Record<string, unknown>>("SELECT * FROM approvals WHERE run_id = ? AND step_id = ?", [runId, stepId]);
  if (!row) return undefined;
  return ApprovalSchema.parse({
    id: row.id,
    runId: row.run_id,
    stepId: row.step_id,
    actorId: row.actor_id,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at ?? undefined
  });
}

function persistCapability(runId: string, capability: ReturnType<typeof mintCapability>): void {
  run("INSERT INTO capabilities (id, run_id, payload_json) VALUES (?, ?, ?)", [capability.id, runId, JSON.stringify(capability)]);
}

function updateState(runId: string, state: string, blockedReason?: string): void {
  run("UPDATE runs SET state = ?, blocked_reason = COALESCE(?, blocked_reason), updated_at = ? WHERE id = ?", [
    state,
    blockedReason ?? null,
    nowIso(),
    runId
  ]);
}

function idempotencyKey(runId: string, step: PlanStep): string {
  return `${runId}:${step.id}:${step.action}`;
}

function requireRun(runId: string): Record<string, unknown> {
  const row = get<Record<string, unknown>>("SELECT * FROM runs WHERE id = ?", [runId]);
  if (!row) throw new Error(`Unknown run ${runId}`);
  return row;
}

export function getSnapshot(runId?: string): DemoSnapshot {
  if (!runId) {
    const latest = get<{ id: string }>("SELECT id FROM runs ORDER BY created_at DESC LIMIT 1");
    if (!latest) return emptySnapshot();
    runId = latest.id;
  }
  const row = requireRun(runId);
  const actor = {
    id: String(row.actor_id),
    name: String(row.actor_name),
    role: row.actor_role as never
  };
  const approvals = all<Record<string, unknown>>("SELECT * FROM approvals WHERE run_id = ? ORDER BY created_at ASC", [runId]).map(
    (approval) =>
      ApprovalSchema.parse({
        id: approval.id,
        runId: approval.run_id,
        stepId: approval.step_id,
        actorId: approval.actor_id,
        status: approval.status,
        createdAt: approval.created_at,
        decidedAt: approval.decided_at ?? undefined
      })
  );
  const policyDecisions = all<Record<string, unknown>>(
    "SELECT payload_redacted FROM audit_events WHERE run_id = ? AND type = 'policy_decision' ORDER BY sequence ASC",
    [runId]
  ).map((decision) => PolicyDecisionSchema.parse(JSON.parse(String(decision.payload_redacted))));
  const capabilities = all<Record<string, unknown>>("SELECT payload_json FROM capabilities WHERE run_id = ? ORDER BY id ASC", [runId]).map((capability) =>
    CapabilitySchema.parse(JSON.parse(String(capability.payload_json)))
  );
  const toolCalls = all<Record<string, unknown>>("SELECT payload_json FROM tool_calls WHERE run_id = ? ORDER BY id ASC", [runId]).map((toolCall) =>
    ToolCallSchema.parse(JSON.parse(String(toolCall.payload_json)))
  );
  const stateDiffs = all<Record<string, unknown>>(
    "SELECT payload_redacted FROM audit_events WHERE run_id = ? AND type = 'tool_result' ORDER BY sequence ASC",
    [runId]
  ).map((diff) => StateDiffSchema.parse(JSON.parse(String(diff.payload_redacted))));
  const evidence = row.state === "completed" || row.state === "paused" || row.state === "blocked" || row.state === "denied" ? exportEvidence(runId) : null;
  return DemoSnapshotSchema.parse({
    runId,
    state: row.state,
    actor,
    prompt: row.prompt,
    scenario: row.scenario,
    plan: row.plan_json ? JSON.parse(String(row.plan_json)) : null,
    approvals,
    connectorActivity: listActivity(runId),
    auditEvents: listAudit(runId),
    policyDecisions,
    capabilities,
    toolCalls,
    stateDiffs,
    finalReport: row.final_report,
    evidence,
    blockedReason: row.blocked_reason
  });
}

function emptySnapshot(): DemoSnapshot {
  return DemoSnapshotSchema.parse({
    runId: null,
    state: null,
    actor: null,
    prompt: DEFAULT_PROMPT,
    scenario: "happy_path",
    plan: null,
    approvals: [],
    connectorActivity: [],
    auditEvents: [],
    policyDecisions: [],
    capabilities: [],
    toolCalls: [],
    stateDiffs: [],
    finalReport: null,
    evidence: null,
    blockedReason: null
  });
}

function assertRunActor(runRow: Record<string, unknown>, actor: Actor): void {
  if (String(runRow.actor_id) !== actor.id) {
    throw new HttpError(403, "ACTOR_FORBIDDEN", "Signed demo session actor is not authorized for this run.");
  }
}

function buildConnectorInput(step: PlanStep): Record<string, unknown> {
  const employeeId = employeeIdFromResource(step.resource);
  const input: Record<string, unknown> = { employeeId };
  if (step.action === "transfer_ticket_ownership") {
    input.transferOwnerId = "emp_priya";
  }
  return input;
}

function employeeIdFromResource(resource: string): string {
  const employeeId = resource.split(":").find((part) => part.startsWith("emp_"));
  if (!employeeId?.startsWith("emp_")) {
    throw new Error(`Unsupported connector resource ${resource}`);
  }
  return employeeId;
}
