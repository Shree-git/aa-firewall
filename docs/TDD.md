# TDD: AA Firewall

## Architecture

AA Firewall is a Next.js TypeScript modular monolith. The model can propose a typed plan, but authority lives in deterministic server code: policy evaluator, broker, signed capabilities, approval gates, connectors, and audit.

```
Browser UI
  | prompt / approve / retry / export
  v
Next.js API Routes
  | startRun / approveStep / retryStep / exportEvidence
  v
Workflow Runner ---> Planner
  |                live LLM if configured, deterministic fallback otherwise
  v
Tool Broker ---> Policy Evaluator ---> Capability Signer
  |                    |                    |
  |                    v                    v
  |                 Audit Store <------ signed read/write capabilities
  v
Connectors: internal DB | REST tickets | GraphQL directory | legacy billing mock
  |
  v
SQLite demo state + append-only chain-hashed audit events
```

Runtime choices: SQLite for state/audit, JSON only for seed fixtures, central Zod schemas, live LLM planner with deterministic fallback, TypeScript policy evaluator, and HMAC-signed short-lived capabilities.

## Core Flow

```
Prompt -> validate actor/session -> create run -> typed plan
  -> broker evaluates reads -> connectors fetch state
  -> approval requested for writes -> broker mints write capabilities
  -> connectors execute with idempotency keys -> audit records all events
  -> replay/export evidence packet
```

State machine:

```
created -> planning -> awaiting_approval -> executing -> completed
              |              |                |
              v              v                v
            blocked        denied          paused
                                             |
                                             v
                                           retrying -> executing
```

## Security Model

- Deny by default.
- Simulated roles: `it_admin`, `manager`, `employee`, `security_auditor`.
- Model output and connector output are untrusted until validated and authorized.
- Read capabilities mint after policy approval; write capabilities mint only after human approval.
- Broker rejects expired, malformed, wrong-scope, wrong-resource, or tampered capabilities.
- Audit write failure blocks further execution.

## Data Contracts

Core shared schemas: `Capability`, `AuditEvent`, `ToolCall`, `EvidencePacket`, `AgentPlan`, `Approval`, and `ConnectorActivity`. These live in `src/server/schemas.ts` and are used by runtime code and tests.

Audit hash input is canonical JSON of event fields excluding `hash`, prefixed by `prevHash`. Every retry creates a new audit event referencing the same idempotency key.

## Failure Modes and Tests

| Codepath | Failure mode | Handling | Test |
|---|---|---|---|
| Planner | malformed LLM JSON | fallback or plan error; no tools execute | Vitest |
| Policy | unauthorized role | deny before capability mint; audit denial | Vitest |
| Approval | user denies write | run becomes `denied`; no write capability | Vitest + Playwright |
| Capability | expired/tampered token | broker rejects; audit `capability_invalid` | Vitest |
| Connector | REST timeout after DB write | pause, record failure, retry same idempotency key | Vitest + Playwright |
| Audit | hash-chain mismatch | replay/export marks integrity failure | Vitest |
| Prompt injection | malicious ticket text | displayed as data; no unauthorized tool call | Vitest |
| UI | double approval click | one approval row, one write capability | Playwright |

## Implementation Order

1. Scaffold Next.js, Vitest, Playwright, Zod, SQLite.
2. Implement shared schemas.
3. Implement policy evaluator, broker, capabilities, approvals.
4. Implement workflow and connector mocks.
5. Implement chain-hashed audit and evidence export.
6. Implement dashboard UI and E2E coverage.
7. Record demo video and submission notes.

## Not in Scope

Real OIDC/LDAP, OPA/Cedar, production connectors, Dockerized microservices, Temporal, connector marketplace, HA, secrets rotation, and compliance certification are deferred.
