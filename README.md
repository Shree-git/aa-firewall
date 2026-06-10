# AA Firewall

AA Firewall is a panel-ready prototype of a secure behind-the-firewall agent framework for enterprise operations.

The demo workflow is employee offboarding/access cleanup. A natural-language request becomes a typed plan, then the server enforces signed demo sessions, RBAC, scoped capabilities, batch human approval, connector idempotency, transactional audit durability, and evidence export.

## What It Shows

- Natural language to multi-step typed agent plan.
- Simulated SSO/RBAC through signed server-owned demo sessions.
- Internal connectors for SQLite-backed DB, REST ticketing, GraphQL directory, and legacy billing.
- A `Live Systems` proof band showing real local backend state changes through capability-gated protocol routes.
- Security Probe checks for missing bearer token `401`, wrong-scope token `403`, and valid write token `200`.
- Raw protocol inspector for REST, GraphQL, SQLite-backed, and fixed-width legacy calls.
- Tool/action/resource/scope capability binding before connector execution.
- One honest batch approval gate for destructive writes.
- SQLite transactions around connector mutation, idempotency record, connector activity, and audit append.
- Chain-hashed audit replay plus redacted before/after state diffs in the evidence packet.
- Prompt-injection and post-write REST timeout negative paths.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The app works without a live model by using the deterministic fallback planner.

## Environment

Create `.env.local` for live planner testing:

```bash
OPENROUTER_API_KEY=replace-with-your-key
OPENROUTER_MODEL=minimax/minimax-m3
CAPABILITY_SECRET=replace-with-local-secret
SESSION_SECRET=replace-with-local-secret
```

Do not commit `.env.local`. `.env.example` contains placeholders only.

## Verify

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`npm run verify` runs lint/typecheck, unit tests, production build, and Playwright E2E. If port `3108` is occupied, run E2E with another port:

```bash
E2E_PORT=3110 npm run test:e2e
```

## Reviewer Flow

1. Reset seed state.
2. Generate the standard offboarding plan as `IT Admin: Jordan Lee`.
3. In `Live Systems`, show Alex's employee row, access grants, tickets, directory manager, and legacy billing record before approval.
4. Open the protocol inspector to show `Authorization: Bearer <capability-id>` gated local endpoints and redacted payloads.
5. Approve the single write batch gate.
6. Show tickets transferred, grants revoked, billing disabled, and the timeline/audit events updated.
7. Run Security Probe and show expected `401`, `403`, and `200` outcomes.
8. Export evidence and verify it includes audit replay, capabilities, tool calls, approval records, and redacted state diffs.
9. Repeat with `REST timeout after write`, approve the batch, then retry the paused step to show idempotent recovery.

## Submission Links

Use `docs/submission-packet.md` as the fill-in packet. `docs/PRD.md`, `docs/TDD.md`, and `docs/demo-script.md` are written to match the current implementation and tests.
