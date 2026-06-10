import { buildSchema, graphqlSync } from "graphql";
import { all, get, run } from "./db";
import { newId, nowIso } from "./id";
import { verifyCapability } from "./security";
import {
  Capability,
  CapabilityProbeResult,
  CapabilityProbeResultSchema,
  InternalCallFrame,
  InternalCallFrameSchema,
  InternalSystemName,
  InternalSystemSnapshot,
  InternalSystemSnapshotSchema,
  ToolCall
} from "./schemas";

export type ConnectorResult = {
  status: "success" | "already_applied";
  message: string;
  before?: unknown;
  after?: unknown;
};

type ExpectedCapability = {
  tool: Capability["tool"];
  action: Capability["action"];
  resource: string;
  scope: Capability["scope"];
};

type EndpointResult<T = unknown> = {
  statusCode: number;
  body: T;
  capabilityId: string | null;
  capabilityStatus: InternalCallFrame["capabilityStatus"];
};

const EMPLOYEE_ID = "emp_alex";
const TRANSFER_OWNER_ID = "emp_priya";

const directorySchema = buildSchema(`
  type Manager {
    id: String!
    name: String!
    department: String!
  }

  type Employee {
    id: String!
    name: String!
    department: String!
    manager: Manager
  }

  type Query {
    employee(id: String!): Employee
  }
`);

export function executeInternalToolCall(call: ToolCall): ConnectorResult {
  switch (call.action) {
    case "read_employee": {
      const employeeId = inputString(call, "employeeId");
      const response = getEmployeeEndpoint({ employeeId, authorization: bearer(call.capability.id), runId: call.runId });
      ensureOk(response);
      return { status: "success", message: "Read Alex Chen employee profile from internal DB.", after: response.body };
    }
    case "read_access": {
      const employeeId = inputString(call, "employeeId");
      const response = getAccessEndpoint({ employeeId, authorization: bearer(call.capability.id), runId: call.runId });
      ensureOk(response);
      const grants = (response.body as { grants: unknown[] }).grants;
      return { status: "success", message: `Read ${grants.length} active access grants.`, after: grants };
    }
    case "read_tickets": {
      const employeeId = inputString(call, "employeeId");
      const response = getTicketsEndpoint({ owner: employeeId, authorization: bearer(call.capability.id), runId: call.runId });
      ensureOk(response);
      const tickets = (response.body as { tickets: unknown[] }).tickets;
      return { status: "success", message: `Read ${tickets.length} open tickets, including one malicious seeded note.`, after: tickets };
    }
    case "read_directory": {
      const employeeId = inputString(call, "employeeId");
      const response = postDirectoryEndpoint({
        authorization: bearer(call.capability.id),
        runId: call.runId,
        query: "query EmployeeManager($id: String!) { employee(id: $id) { id name department manager { id name department } } }",
        variables: { id: employeeId }
      });
      ensureOk(response);
      return { status: "success", message: "Read GraphQL directory manager relationship.", after: response.body };
    }
    case "transfer_ticket_ownership": {
      const employeeId = inputString(call, "employeeId");
      const transferOwnerId = inputString(call, "transferOwnerId");
      const response = postTicketTransferEndpoint({
        employeeId,
        transferOwnerId,
        authorization: bearer(call.capability.id),
        runId: call.runId
      });
      ensureOk(response);
      const body = response.body as { before: unknown; after: unknown };
      return { status: "success", message: "Transferred Alex Chen's open tickets to Priya Shah.", before: body.before, after: body.after };
    }
    case "revoke_saas_access":
    case "revoke_database_access": {
      const employeeId = inputString(call, "employeeId");
      const system = call.action === "revoke_saas_access" ? "SaaS" : "Database";
      const resourcePrefix = call.action === "revoke_saas_access" ? "saas" : "database";
      const response = executeEndpoint({
        runId: call.runId,
        system: "internal_db",
        method: "PATCH",
        path: `/api/internal/db/access?employeeId=${employeeId}&system=${system}`,
        expected: {
          tool: "internal_db",
          action: call.action,
          resource: `${resourcePrefix}:${employeeId}`,
          scope: "write"
        },
        authorization: bearer(call.capability.id),
        request: { employeeId, system, status: "revoked" },
        handler: () => {
          const before = all("SELECT * FROM access_grants WHERE employee_id = ? AND system = ?", [employeeId, system]);
          run("UPDATE access_grants SET status = 'revoked' WHERE employee_id = ? AND system = ?", [employeeId, system]);
          const after = all("SELECT * FROM access_grants WHERE employee_id = ? AND system = ?", [employeeId, system]);
          return { before: redact(before), after: redact(after) };
        }
      });
      ensureOk(response);
      const body = response.body as { before: unknown; after: unknown };
      return {
        status: "success",
        message: call.action === "revoke_saas_access" ? "Revoked SaaS access grants." : "Revoked database warehouse access.",
        before: body.before,
        after: body.after
      };
    }
    case "disable_billing_access": {
      const employeeId = inputString(call, "employeeId");
      const response = postLegacyBillingDisableEndpoint({
        employeeId,
        authorization: bearer(call.capability.id),
        runId: call.runId
      });
      ensureOk(response);
      const body = response.body as { before: unknown; after: unknown };
      return { status: "success", message: "Disabled fixed-width legacy billing access.", before: body.before, after: body.after };
    }
    case "generate_report":
      return { status: "success", message: "Generated final offboarding evidence report." };
    default:
      throw new Error(`Unsupported connector action ${call.action}`);
  }
}

export function getEmployeeEndpoint(params: { employeeId: string; authorization: string | null; runId?: string | null }): EndpointResult {
  const response = executeEndpoint({
    runId: params.runId ?? null,
    system: "internal_db",
    method: "GET",
    path: `/api/internal/db/employee/${params.employeeId}`,
    expected: {
      tool: "internal_db",
      action: "read_employee",
      resource: `employee:${params.employeeId}`,
      scope: "read"
    },
    authorization: params.authorization,
    request: { employeeId: params.employeeId },
    handler: () => ({ employee: redact(get("SELECT * FROM employees WHERE id = ?", [params.employeeId]) ?? null) })
  });
  return response;
}

export function getAccessEndpoint(params: { employeeId: string; authorization: string | null; runId?: string | null }): EndpointResult {
  return executeEndpoint({
    runId: params.runId ?? null,
    system: "internal_db",
    method: "GET",
    path: `/api/internal/db/access?employeeId=${params.employeeId}`,
    expected: {
      tool: "internal_db",
      action: "read_access",
      resource: `access:${params.employeeId}`,
      scope: "read"
    },
    authorization: params.authorization,
    request: { employeeId: params.employeeId },
    handler: () => ({ grants: redact(all("SELECT * FROM access_grants WHERE employee_id = ?", [params.employeeId])) })
  });
}

export function getTicketsEndpoint(params: { owner: string; authorization: string | null; runId?: string | null }): EndpointResult {
  return executeEndpoint({
    runId: params.runId ?? null,
    system: "rest_tickets",
    method: "GET",
    path: `/api/internal/rest/tickets?owner=${params.owner}`,
    expected: {
      tool: "rest_tickets",
      action: "read_tickets",
      resource: `tickets:${params.owner}`,
      scope: "read"
    },
    authorization: params.authorization,
    request: { owner: params.owner },
    handler: () => ({ tickets: redact(all("SELECT * FROM tickets WHERE owner_id = ? AND status = 'open'", [params.owner])) })
  });
}

export function postTicketTransferEndpoint(params: {
  employeeId: string;
  transferOwnerId: string;
  authorization: string | null;
  runId?: string | null;
  dryRun?: boolean;
}): EndpointResult {
  return executeEndpoint({
    runId: params.runId ?? null,
    system: "rest_tickets",
    method: "POST",
    path: "/api/internal/rest/tickets/transfer",
    expected: {
      tool: "rest_tickets",
      action: "transfer_ticket_ownership",
      resource: `tickets:${params.employeeId}`,
      scope: "write"
    },
    authorization: params.authorization,
    request: { employeeId: params.employeeId, transferOwnerId: params.transferOwnerId, dryRun: Boolean(params.dryRun) },
    handler: () => {
      const before = all("SELECT * FROM tickets WHERE owner_id = ?", [params.employeeId]);
      if (!params.dryRun) {
        run("UPDATE tickets SET owner_id = ? WHERE owner_id = ?", [params.transferOwnerId, params.employeeId]);
      }
      const after = all("SELECT * FROM tickets WHERE owner_id = ?", [params.dryRun ? params.employeeId : params.transferOwnerId]);
      return {
        message: params.dryRun ? "Valid write token accepted; mutation skipped for probe." : "Transferred tickets.",
        before: redact(before),
        after: redact(after)
      };
    }
  });
}

export function postDirectoryEndpoint(params: {
  authorization: string | null;
  query: string;
  variables?: Record<string, unknown>;
  runId?: string | null;
}): EndpointResult {
  const employeeId = typeof params.variables?.id === "string" ? params.variables.id : EMPLOYEE_ID;
  return executeEndpoint({
    runId: params.runId ?? null,
    system: "graphql_directory",
    method: "POST",
    path: "/api/internal/graphql/directory",
    expected: {
      tool: "graphql_directory",
      action: "read_directory",
      resource: `directory:${employeeId}`,
      scope: "read"
    },
    authorization: params.authorization,
    request: { query: params.query, variables: params.variables ?? {} },
    handler: () => {
      const result = graphqlSync({
        schema: directorySchema,
        source: params.query,
        rootValue: {
          employee: ({ id }: { id: string }) => directoryEmployee(id)
        },
        variableValues: params.variables
      });
      if (result.errors?.length) {
        return { errors: result.errors.map((error) => error.message) };
      }
      return redact(result);
    },
    statusFromBody: (body) => (typeof body === "object" && body && "errors" in body ? 400 : 200)
  });
}

export function getLegacyBillingEndpoint(params: { employeeId: string; authorization: string | null; runId?: string | null }): EndpointResult {
  return executeEndpoint({
    runId: params.runId ?? null,
    system: "legacy_billing",
    method: "GET",
    path: `/api/internal/legacy/billing/${params.employeeId}`,
    expected: {
      tool: "legacy_billing",
      action: "disable_billing_access",
      resource: `legacy_billing:${params.employeeId}`,
      scope: "write"
    },
    authorization: params.authorization,
    request: { employeeId: params.employeeId },
    handler: () => ({ record: legacyBillingSnapshot(params.employeeId) })
  });
}

export function postLegacyBillingDisableEndpoint(params: {
  employeeId: string;
  authorization: string | null;
  runId?: string | null;
  dryRun?: boolean;
}): EndpointResult {
  return executeEndpoint({
    runId: params.runId ?? null,
    system: "legacy_billing",
    method: "POST",
    path: "/api/internal/legacy/billing/disable",
    expected: {
      tool: "legacy_billing",
      action: "disable_billing_access",
      resource: `legacy_billing:${params.employeeId}`,
      scope: "write"
    },
    authorization: params.authorization,
    request: { employeeId: params.employeeId, dryRun: Boolean(params.dryRun), fixedWidth: legacyBillingSnapshot(params.employeeId).rawRecord },
    handler: () => {
      const before = legacyBillingSnapshot(params.employeeId);
      if (!params.dryRun) {
        run("UPDATE legacy_billing SET status = 'disabled' WHERE employee_id = ?", [params.employeeId]);
        run("UPDATE access_grants SET status = 'revoked' WHERE employee_id = ? AND system = 'Legacy'", [params.employeeId]);
      }
      const after = legacyBillingSnapshot(params.employeeId);
      return { before, after, message: params.dryRun ? "Valid billing token accepted; mutation skipped for probe." : "Billing disabled." };
    }
  });
}

export function getInternalSystemSnapshot(runId?: string | null): InternalSystemSnapshot {
  const frames = listInternalCallFrames(runId ?? latestRunId());
  const employee = redact(get("SELECT * FROM employees WHERE id = ?", [EMPLOYEE_ID]) ?? null) as Record<string, unknown> | null;
  const directory = redact(directoryEmployee(EMPLOYEE_ID)) as Record<string, unknown> | null;
  const snapshot = {
    runId: runId ?? latestRunId(),
    employee,
    accessGrants: redact(all("SELECT * FROM access_grants WHERE employee_id = ? ORDER BY id ASC", [EMPLOYEE_ID])) as Record<string, unknown>[],
    tickets: redact(all("SELECT * FROM tickets WHERE id IN ('ticket_1942', 'ticket_2047') ORDER BY id ASC")) as Record<string, unknown>[],
    directory,
    legacyBilling: legacyBillingSnapshot(EMPLOYEE_ID),
    lastCalls: latestCallPerSystem(frames),
    protocolFrames: frames,
    capabilityProbeResults: listProbeResults(runId ?? latestRunId())
  };
  return InternalSystemSnapshotSchema.parse(snapshot);
}

export function runCapabilityProbe(runId: string): CapabilityProbeResult[] {
  run("DELETE FROM capability_probe_results WHERE run_id = ?", [runId]);
  const readTicketCapability = findCapability(runId, "rest_tickets", "read_tickets");
  const writeTicketCapability = findCapability(runId, "rest_tickets", "transfer_ticket_ownership");
  const results = [
    probeResult(
      runId,
      "missing token",
      401,
      getTicketsEndpoint({ owner: EMPLOYEE_ID, authorization: null, runId }).statusCode,
      "Token rejected"
    ),
    probeResult(
      runId,
      "wrong scope/token",
      403,
      postTicketTransferEndpoint({
        employeeId: EMPLOYEE_ID,
        transferOwnerId: TRANSFER_OWNER_ID,
        authorization: readTicketCapability ? bearer(readTicketCapability.id) : null,
        runId,
        dryRun: true
      }).statusCode,
      "Scope mismatch"
    ),
    probeResult(
      runId,
      "valid write token",
      200,
      writeTicketCapability
        ? postTicketTransferEndpoint({
            employeeId: EMPLOYEE_ID,
            transferOwnerId: TRANSFER_OWNER_ID,
            authorization: bearer(writeTicketCapability.id),
            runId,
            dryRun: true
          }).statusCode
        : 403,
      writeTicketCapability ? "Write token accepted" : "No write token minted yet"
    )
  ];
  results.forEach((result) => {
    run(
      "INSERT INTO capability_probe_results (id, run_id, label, status_code, expected, message, passed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [result.id, result.runId, result.label, result.statusCode, result.expected, result.message, result.passed ? 1 : 0, result.createdAt]
    );
  });
  return results;
}

export function listProbeResults(runId?: string | null): CapabilityProbeResult[] {
  if (!runId) return [];
  return all<Record<string, unknown>>(
    "SELECT * FROM capability_probe_results WHERE run_id = ? ORDER BY created_at ASC, id ASC",
    [runId]
  ).map((row) =>
    CapabilityProbeResultSchema.parse({
      id: row.id,
      runId: row.run_id,
      label: row.label,
      statusCode: Number(row.status_code),
      expected: Number(row.expected),
      message: row.message,
      passed: Number(row.passed) === 1,
      createdAt: row.created_at
    })
  );
}

function executeEndpoint(params: {
  runId: string | null;
  system: InternalSystemName;
  method: string;
  path: string;
  expected: ExpectedCapability;
  authorization: string | null;
  request: unknown;
  handler: () => unknown;
  statusFromBody?: (body: unknown) => number;
}): EndpointResult {
  const auth = verifyAuthorization(params.authorization, params.expected);
  let statusCode = auth.statusCode;
  let body: unknown = { error: auth.message };
  if (auth.ok) {
    body = params.handler();
    statusCode = params.statusFromBody?.(body) ?? 200;
  }
  recordInternalCallFrame({
    runId: params.runId,
    system: params.system,
    method: params.method,
    path: params.path,
    requestRedacted: redact(params.request),
    responseRedacted: redact(body),
    statusCode,
    capabilityId: auth.capabilityId,
    capabilityStatus: auth.capabilityStatus
  });
  return { statusCode, body, capabilityId: auth.capabilityId, capabilityStatus: auth.capabilityStatus };
}

function verifyAuthorization(authorization: string | null, expected: ExpectedCapability): {
  ok: boolean;
  statusCode: number;
  message: string;
  capabilityId: string | null;
  capabilityStatus: InternalCallFrame["capabilityStatus"];
} {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return { ok: false, statusCode: 401, message: "Missing bearer capability token.", capabilityId: null, capabilityStatus: "missing" };
  }
  const capability = getCapability(token);
  if (!capability) {
    return { ok: false, statusCode: 403, message: "Capability token not found.", capabilityId: token, capabilityStatus: "invalid" };
  }
  const verified = verifyCapability(capability, expected);
  if (!verified.ok) {
    return {
      ok: false,
      statusCode: 403,
      message: verified.reason,
      capabilityId: capability.id,
      capabilityStatus: verified.reason.includes("scope") || verified.reason.includes("tool/action") || verified.reason.includes("resource") ? "scope_mismatch" : "invalid"
    };
  }
  return { ok: true, statusCode: 200, message: "Capability valid.", capabilityId: capability.id, capabilityStatus: "valid" };
}

function recordInternalCallFrame(frame: Omit<InternalCallFrame, "id" | "createdAt">): InternalCallFrame {
  const parsed = InternalCallFrameSchema.parse({
    ...frame,
    id: newId("frame"),
    createdAt: nowIso()
  });
  run(
    "INSERT INTO internal_call_frames (id, run_id, system, method, path, request_redacted, response_redacted, status_code, capability_id, capability_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      parsed.id,
      parsed.runId,
      parsed.system,
      parsed.method,
      parsed.path,
      JSON.stringify(parsed.requestRedacted),
      JSON.stringify(parsed.responseRedacted),
      parsed.statusCode,
      parsed.capabilityId,
      parsed.capabilityStatus,
      parsed.createdAt
    ]
  );
  return parsed;
}

function listInternalCallFrames(runId?: string | null): InternalCallFrame[] {
  const rows = runId
    ? all<Record<string, unknown>>("SELECT * FROM internal_call_frames WHERE run_id = ? ORDER BY created_at ASC, id ASC", [runId])
    : all<Record<string, unknown>>("SELECT * FROM internal_call_frames ORDER BY created_at ASC, id ASC");
  return rows.map((row) =>
    InternalCallFrameSchema.parse({
      id: row.id,
      runId: row.run_id ?? null,
      system: row.system,
      method: row.method,
      path: row.path,
      requestRedacted: JSON.parse(String(row.request_redacted)),
      responseRedacted: JSON.parse(String(row.response_redacted)),
      statusCode: Number(row.status_code),
      capabilityId: row.capability_id ?? null,
      capabilityStatus: row.capability_status,
      createdAt: row.created_at
    })
  );
}

function latestCallPerSystem(frames: InternalCallFrame[]): InternalCallFrame[] {
  const bySystem = new Map<InternalSystemName, InternalCallFrame>();
  frames.forEach((frame) => bySystem.set(frame.system, frame));
  return Array.from(bySystem.values());
}

function getCapability(id: string): Capability | undefined {
  const row = get<{ payload_json: string }>("SELECT payload_json FROM capabilities WHERE id = ?", [id]);
  if (!row) return undefined;
  return JSON.parse(row.payload_json) as Capability;
}

function findCapability(runId: string, tool: Capability["tool"], action: Capability["action"]): Capability | undefined {
  const rows = all<{ payload_json: string }>("SELECT payload_json FROM capabilities WHERE run_id = ? ORDER BY rowid DESC", [runId]);
  return rows.map((item) => JSON.parse(item.payload_json) as Capability).find((capability) => capability.tool === tool && capability.action === action);
}

function probeResult(runId: string, label: string, expected: number, statusCode: number, message: string): CapabilityProbeResult {
  return CapabilityProbeResultSchema.parse({
    id: newId("probe"),
    runId,
    label,
    statusCode,
    expected,
    message,
    passed: statusCode === expected,
    createdAt: nowIso()
  });
}

function legacyBillingSnapshot(employeeId: string): Record<string, unknown> {
  const row = get<Record<string, unknown>>("SELECT * FROM legacy_billing WHERE employee_id = ?", [employeeId]);
  const accountCode = "[redacted]";
  const status = String(row?.status ?? "missing");
  const rawRecord = `${employeeId.padEnd(12)}${accountCode.padEnd(18)}${status.padEnd(10)}`;
  return {
    parsed: {
      employeeId,
      accountCode,
      status
    },
    rawRecord
  };
}

function directoryEmployee(id: string): Record<string, unknown> | null {
  const employee = get<Record<string, unknown>>("SELECT * FROM employees WHERE id = ?", [id]);
  if (!employee) return null;
  const manager = get<Record<string, unknown>>(
    "SELECT manager.* FROM directory_edges edge JOIN employees manager ON manager.id = edge.manager_id WHERE edge.employee_id = ? AND edge.relation = 'manager'",
    [id]
  );
  return {
    id: employee.id,
    name: employee.name,
    department: employee.department,
    manager: manager
      ? {
          id: manager.id,
          name: manager.name,
          department: manager.department
        }
      : null
  };
}

function latestRunId(): string | null {
  return get<{ id: string }>("SELECT id FROM runs ORDER BY created_at DESC LIMIT 1")?.id ?? null;
}

function inputString(call: ToolCall, key: "employeeId" | "transferOwnerId"): string {
  const value = call.input[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`Connector input missing ${key}.`);
  }
  return value;
}

function ensureOk(response: EndpointResult): void {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Internal endpoint rejected call with ${response.statusCode}.`);
  }
}

function bearer(capabilityId: string): string {
  return `Bearer ${capabilityId}`;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, raw]) => {
      if (["email", "body", "account_code", "accountCode"].includes(key)) return [key, "[redacted]"];
      return [key, redact(raw)];
    })
  );
}
