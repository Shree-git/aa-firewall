import { AuditEvent, AuditEventSchema } from "./schemas";
import { canonicalJson, digest, newId, nowIso } from "./id";
import { all, get, run } from "./db";

const GENESIS_HASH = "0".repeat(64);

export function appendAudit(input: Omit<AuditEvent, "id" | "sequence" | "prevHash" | "hash" | "createdAt">): AuditEvent {
  const last = get<{ sequence: number; hash: string }>(
    "SELECT sequence, hash FROM audit_events WHERE run_id = ? ORDER BY sequence DESC LIMIT 1",
    [input.runId]
  );
  const sequence = (last?.sequence ?? -1) + 1;
  const prevHash = last?.hash ?? GENESIS_HASH;
  const unsigned = {
    id: newId("audit"),
    sequence,
    prevHash,
    createdAt: nowIso(),
    ...input
  };
  const hash = digest({ ...unsigned, hash: undefined });
  const event = AuditEventSchema.parse({ ...unsigned, hash });
  run(
    `INSERT INTO audit_events
      (id, run_id, sequence, type, actor_id, tool, action, resource, decision, payload_redacted, result_digest, idempotency_key, prev_hash, hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id,
      event.runId,
      event.sequence,
      event.type,
      event.actorId,
      event.tool ?? null,
      event.action ?? null,
      event.resource ?? null,
      event.decision ?? null,
      JSON.stringify(event.payloadRedacted),
      event.resultDigest ?? null,
      event.idempotencyKey ?? null,
      event.prevHash,
      event.hash,
      event.createdAt
    ]
  );
  return event;
}

export function listAudit(runId: string): AuditEvent[] {
  return all<Record<string, unknown>>("SELECT * FROM audit_events WHERE run_id = ? ORDER BY sequence ASC", [runId]).map((row) =>
    AuditEventSchema.parse({
      id: row.id,
      runId: row.run_id,
      sequence: row.sequence,
      type: row.type,
      actorId: row.actor_id,
      tool: row.tool ?? undefined,
      action: row.action ?? undefined,
      resource: row.resource ?? undefined,
      decision: row.decision ?? undefined,
      payloadRedacted: JSON.parse(String(row.payload_redacted)),
      resultDigest: row.result_digest ?? undefined,
      idempotencyKey: row.idempotency_key ?? undefined,
      prevHash: row.prev_hash,
      hash: row.hash,
      createdAt: row.created_at
    })
  );
}

export function verifyAudit(runId: string): { ok: boolean; failedAt?: number; rootHash: string } {
  const events = listAudit(runId);
  let prevHash = GENESIS_HASH;
  for (const event of events) {
    const { hash, ...unsigned } = event;
    const expected = digest({ ...unsigned, hash: undefined });
    if (event.prevHash !== prevHash || hash !== expected) {
      return { ok: false, failedAt: event.sequence, rootHash: events.at(-1)?.hash ?? GENESIS_HASH };
    }
    prevHash = hash;
  }
  return { ok: true, rootHash: events.at(-1)?.hash ?? GENESIS_HASH };
}

export function auditDigest(value: unknown): string {
  return digest(canonicalJson(value));
}
