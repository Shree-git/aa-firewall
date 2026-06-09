import { auditDigest, appendAudit } from "./audit";
import { all, get, run } from "./db";
import { newId, nowIso } from "./id";
import { ConnectorActivity, ToolCall, ToolNameSchema } from "./schemas";

type ConnectorResult = {
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
  const existing = get<{ result_json: string }>("SELECT result_json FROM operations WHERE idempotency_key = ?", [call.idempotencyKey]);
  if (existing) {
    return { ...JSON.parse(existing.result_json), status: "already_applied" };
  }

  const result = applyAction(call);
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
    payloadRedacted: { message: result.message, status: result.status },
    resultDigest: auditDigest(result),
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
    throw new ConnectorError("REST ticketing timed out after write.", result);
  }

  return result;
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

function applyAction(call: ToolCall): ConnectorResult {
  switch (call.action) {
    case "read_employee": {
      const employee = get("SELECT * FROM employees WHERE id = ?", ["emp_alex"]);
      return { status: "success", message: "Read Alex Chen employee profile from internal DB.", after: employee };
    }
    case "read_access": {
      const grants = all("SELECT * FROM access_grants WHERE employee_id = ?", ["emp_alex"]);
      return { status: "success", message: `Read ${grants.length} active access grants.`, after: grants };
    }
    case "read_tickets": {
      const tickets = all("SELECT * FROM tickets WHERE owner_id = ? AND status = 'open'", ["emp_alex"]);
      return { status: "success", message: `Read ${tickets.length} open tickets, including one malicious seeded note.`, after: tickets };
    }
    case "read_directory": {
      const directory = all("SELECT * FROM directory_edges WHERE employee_id = ?", ["emp_alex"]);
      return { status: "success", message: "Read GraphQL directory manager relationship.", after: directory };
    }
    case "transfer_ticket_ownership": {
      const before = all("SELECT * FROM tickets WHERE owner_id = ?", ["emp_alex"]);
      run("UPDATE tickets SET owner_id = ? WHERE owner_id = ?", ["emp_priya", "emp_alex"]);
      const after = all("SELECT * FROM tickets WHERE owner_id = ?", ["emp_priya"]);
      return { status: "success", message: "Transferred Alex Chen's open tickets to Priya Shah.", before, after };
    }
    case "revoke_saas_access": {
      const before = all("SELECT * FROM access_grants WHERE employee_id = ? AND system = 'SaaS'", ["emp_alex"]);
      run("UPDATE access_grants SET status = 'revoked' WHERE employee_id = ? AND system = 'SaaS'", ["emp_alex"]);
      const after = all("SELECT * FROM access_grants WHERE employee_id = ? AND system = 'SaaS'", ["emp_alex"]);
      return { status: "success", message: "Revoked SaaS access grants.", before, after };
    }
    case "revoke_database_access": {
      const before = all("SELECT * FROM access_grants WHERE employee_id = ? AND system = 'Database'", ["emp_alex"]);
      run("UPDATE access_grants SET status = 'revoked' WHERE employee_id = ? AND system = 'Database'", ["emp_alex"]);
      const after = all("SELECT * FROM access_grants WHERE employee_id = ? AND system = 'Database'", ["emp_alex"]);
      return { status: "success", message: "Revoked database warehouse access.", before, after };
    }
    case "disable_billing_access": {
      const before = get("SELECT * FROM legacy_billing WHERE employee_id = ?", ["emp_alex"]);
      run("UPDATE legacy_billing SET status = 'disabled' WHERE employee_id = ?", ["emp_alex"]);
      run("UPDATE access_grants SET status = 'revoked' WHERE employee_id = ? AND system = 'Legacy'", ["emp_alex"]);
      const after = get("SELECT * FROM legacy_billing WHERE employee_id = ?", ["emp_alex"]);
      return { status: "success", message: "Disabled fixed-width legacy billing access.", before, after };
    }
    case "generate_report":
      return { status: "success", message: "Generated final offboarding evidence report." };
    default:
      throw new ConnectorError(`Unsupported connector action ${call.action}`);
  }
}
