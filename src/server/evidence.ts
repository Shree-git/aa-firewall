import { verifyAudit } from "./audit";
import { all, get } from "./db";
import { nowIso } from "./id";
import {
  Actor,
  AgentPlanSchema,
  ApprovalSchema,
  CapabilitySchema,
  EvidencePacket,
  EvidencePacketSchema,
  PolicyDecisionSchema,
  ToolCallSchema
} from "./schemas";

export function exportEvidence(runId: string): EvidencePacket {
  const runRow = get<Record<string, unknown>>("SELECT * FROM runs WHERE id = ?", [runId]);
  if (!runRow) throw new Error(`Unknown run ${runId}`);
  const actor: Actor = {
    id: String(runRow.actor_id),
    name: String(runRow.actor_name),
    role: runRow.actor_role as Actor["role"]
  };
  const plan = AgentPlanSchema.parse(JSON.parse(String(runRow.plan_json ?? "{}")));
  const approvals = all<Record<string, unknown>>("SELECT * FROM approvals WHERE run_id = ? ORDER BY created_at ASC", [runId]).map((row) =>
    ApprovalSchema.parse({
      id: row.id,
      runId: row.run_id,
      stepId: row.step_id,
      actorId: row.actor_id,
      status: row.status,
      createdAt: row.created_at,
      decidedAt: row.decided_at ?? undefined
    })
  );
  const capabilities = all<Record<string, unknown>>("SELECT payload_json FROM capabilities WHERE run_id = ?", [runId]).map((row) =>
    CapabilitySchema.parse(JSON.parse(String(row.payload_json)))
  );
  const toolCalls = all<Record<string, unknown>>("SELECT payload_json FROM tool_calls WHERE run_id = ?", [runId]).map((row) =>
    ToolCallSchema.parse(JSON.parse(String(row.payload_json)))
  );
  const policyDecisions = all<Record<string, unknown>>(
    "SELECT payload_redacted FROM audit_events WHERE run_id = ? AND type = 'policy_decision' ORDER BY sequence ASC",
    [runId]
  ).map((row) => PolicyDecisionSchema.parse(JSON.parse(String(row.payload_redacted))));
  const stateDiffs = all<Record<string, unknown>>(
    "SELECT payload_redacted FROM audit_events WHERE run_id = ? AND type = 'tool_result' ORDER BY sequence ASC",
    [runId]
  ).map((row) => JSON.parse(String(row.payload_redacted)) as Record<string, unknown>);
  const audit = verifyAudit(runId);

  return EvidencePacketSchema.parse({
    runSummary: {
      runId,
      state: runRow.state,
      integrity: audit.ok ? "verified" : `failed at ${audit.failedAt}`,
      finalReport: runRow.final_report
    },
    prompt: String(runRow.prompt),
    actor,
    plan,
    approvals,
    policyDecisions,
    capabilities,
    toolCalls,
    stateDiffs,
    auditRootHash: audit.rootHash,
    generatedAt: nowIso()
  });
}
