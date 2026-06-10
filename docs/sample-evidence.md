# Sample Evidence Notes

A completed evidence export contains:

- `runSummary` with final state and integrity result.
- `actor` from the signed demo session.
- `plan` and typed steps.
- `approvals` showing the batch decision across write steps.
- `policyDecisions` for reads and writes.
- `capabilities` bound to tool, action, resource, scope, actor, and run.
- `toolCalls` with idempotency keys.
- `stateDiffs` with redacted before/after changes.
- `auditEvents` as the full chain replay.
- `auditRootHash` for integrity verification.

Generate the concrete JSON from the UI with `Export JSON` after a completed or paused run.
