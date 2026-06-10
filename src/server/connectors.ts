import { auditDigest, appendAudit } from "./audit";
import { all, get, run, transaction } from "./db";
import { newId, nowIso } from "./id";
import { executeInternalToolCall } from "./internal-systems";
import { ConnectorActivity, StateDiff, StateDiffSchema, ToolCall, ToolNameSchema } from "./schemas";

export type ConnectorResult = {
  status: "success" | "already_applied";
  message: string;
  before?: unknown;
  after?: unknown;
};

export class ConnectorError extends Error {
  constructor(
    message: string,
    public readonly result?: ConnectorResult
  ) {
    super(message);
  }
}

export function executeConnector(call: ToolCall, actorId: string, scenario: string): ConnectorResult {
  const outcome = transaction(() => {
    const existing = get<{ result_json: string }>("SELECT result_json FROM operations WHERE idempotency_key = ?", [call.idempotencyKey]);
    if (existing) {
      const result = { ...JSON.parse(existing.result_json), status: "already_applied" } as ConnectorResult;
      recordActivity(call, "recovered", `${result.message} Idempotency key reused; no duplicate write.`);
      appendAudit({
        runId: call.runId,
        type: "connector_recovered",
        actorId,
        tool: call.tool,
        action: call.action,
        resource: call.capability.resource,
        decision: "allow",
        payloadRedacted: { message: result.message, status: result.status },
        resultDigest: auditDigest(result),
        idempotencyKey: call.idempotencyKey
      });
      return { result, throwAfterCommit: false };
    }

    const result = executeInternalToolCall(call);
    const diff = buildStateDiff(call, result);
    run("INSERT INTO operations (idempotency_key, result_json, created_at) VALUES (?, ?, ?)", [
      call.idempotencyKey,
      JSON.stringify(result),
      nowIso()
    ]);

    recordActivity(call, "success", result.message);
    appendAudit({
      runId: call.runId,
      type: "tool_result",
      actorId,
      tool: call.tool,
      action: call.action,
      resource: call.capability.resource,
      decision: "allow",
      payloadRedacted: diff,
      resultDigest: diff.digest,
      idempotencyKey: call.idempotencyKey
    });

    if (scenario === "rest_failure" && call.tool === "rest_tickets" && call.action === "transfer_ticket_ownership") {
      recordActivity(call, "failed", "REST ticketing timed out after applying transfer; retry will reuse the idempotency key.");
      appendAudit({
        runId: call.runId,
        type: "connector_failed",
        actorId,
        tool: call.tool,
        action: call.action,
        resource: call.capability.resource,
        decision: "allow",
        payloadRedacted: { error: "REST_TIMEOUT_AFTER_WRITE", recoveredBy: "retry" },
        resultDigest: auditDigest(result),
        idempotencyKey: call.idempotencyKey
      });
      return { result, throwAfterCommit: true };
    }

    return { result, throwAfterCommit: false };
  });

  if (outcome.throwAfterCommit) {
    throw new ConnectorError("REST ticketing timed out after write.", outcome.result);
  }
  return outcome.result;
}

export function recordActivity(
  call: Pick<ToolCall, "runId" | "tool" | "action"> & { id?: string },
  status: ConnectorActivity["status"],
  message: string
): ConnectorActivity {
  const activity: ConnectorActivity = {
    id: newId("activity"),
    stepId: call.id ?? `${call.tool}:${call.action}`,
    tool: ToolNameSchema.parse(call.tool),
    action: call.action,
    status,
    message,
    createdAt: nowIso()
  };
  run(
    "INSERT INTO connector_activity (id, run_id, step_id, tool, action, status, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [activity.id, call.runId, activity.stepId, activity.tool, activity.action, activity.status, activity.message, activity.createdAt]
  );
  return activity;
}

export function listActivity(runId: string): ConnectorActivity[] {
  return all<Record<string, unknown>>("SELECT * FROM connector_activity WHERE run_id = ? ORDER BY created_at ASC", [runId]).map(
    (row) => ({
      id: String(row.id),
      stepId: String(row.step_id),
      tool: ToolNameSchema.parse(row.tool),
      action: row.action as ConnectorActivity["action"],
      status: row.status as ConnectorActivity["status"],
      message: String(row.message),
      createdAt: String(row.created_at)
    })
  );
}

function buildStateDiff(call: ToolCall, result: ConnectorResult): StateDiff {
  return StateDiffSchema.parse({
    stepId: call.idempotencyKey.split(":")[1],
    tool: call.tool,
    action: call.action,
    resource: call.capability.resource,
    message: result.message,
    before: redactState(result.before),
    after: redactState(result.after),
    digest: auditDigest({
      tool: call.tool,
      action: call.action,
      resource: call.capability.resource,
      before: result.before,
      after: result.after
    })
  });
}

function redactState(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactState);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, raw]) => {
      if (["email", "body", "account_code"].includes(key)) return [key, "[redacted]"];
      return [key, raw];
    })
  );
}
