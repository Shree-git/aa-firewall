# Demo Script

## Happy Path

1. Open the app and reset seed state.
2. Keep actor set to `IT Admin: Jordan Lee`.
3. Keep scenario set to `Employee offboarding - standard`.
4. Generate the plan.
5. In `Live Systems`, show the four real local stand-ins: Internal DB, REST Ticketing, GraphQL Directory, and Legacy Billing.
6. Open `Raw protocol inspector` and show method/path/status plus redacted payloads.
7. Approve the single write batch.
8. Show tickets transferred, grants revoked, and fixed-width legacy billing disabled in the system panels.
9. Run `Security Probe` and show `401`, `403`, and `200`.
10. Export the evidence JSON and call out full audit replay plus redacted before/after diffs.

## Negative: Unauthorized Actor

1. Reset seed state.
2. Select `Employee: Alex Chen`.
3. Generate the plan.
4. Show the blocked state and absence of destructive capabilities.

## Negative: REST Timeout Recovery

1. Reset seed state.
2. Select `REST timeout after write`.
3. Generate the plan and approve the write batch.
4. Show the paused run and failed REST ticket connector event.
5. Retry the paused step.
6. Show recovered/completed connector status and unchanged operation count via the evidence/idempotency trail.

## Negative: Prompt Injection

1. Reset seed state.
2. Select `Prompt-injection fixture`.
3. Generate the plan.
4. Show retrieved ticket text as untrusted data.
5. Approve the write batch if needed and show no unrelated CEO capability or tool call is minted.
