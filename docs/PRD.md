# PRD: AA Firewall

## Product Thesis

Large enterprises depend on brittle internal scripts, dashboards, and human runbooks that break when key operators leave or when workflows span too many private systems. AA Firewall is a secure agent execution layer that runs behind the firewall and turns natural language into controlled, audited internal operations.

The wedge is access-sensitive employee offboarding. It is common, painful, compliance-relevant, and requires real multi-system coordination: read identity and access state, inspect customer escalations, transfer ownership, revoke access, disable legacy billing, and produce evidence.

## Target User and Buyer

Primary user: IT operations, security operations, and internal platform teams responsible for access cleanup, ticket ownership transfer, and legacy system administration.

Economic buyer: CIO, CISO, or VP Internal Tools at a large enterprise where internal ops workflows are fragile, access-sensitive, and hard to audit.

## Prototype Workflow

The user asks:

> Offboard Alex Chen effective today: find all systems Alex has access to, check open customer escalations, transfer ownership to Priya Shah, revoke SaaS and database access, disable legacy billing access, and produce an audit report.

The app shows natural-language intake, typed plan generation, simulated SSO/RBAC, policy decisions, connector execution, signed capabilities, a single batch approval gate for destructive writes, retry recovery, prompt-injection containment, and evidence export.

## Current Scope

In scope:

- Next.js TypeScript runnable prototype.
- Simulated SSO/RBAC through signed demo sessions.
- SQLite-backed mock internal DB, REST tickets, GraphQL directory, and legacy billing connectors.
- Policy-gated broker and HMAC-signed short-lived capabilities.
- Tool/action/resource/scope capability binding.
- Batch approval for destructive write actions.
- SQLite transactions around connector mutation and audit append.
- Chain-hashed audit trail and evidence export with redacted before/after diffs.
- Negative demos for unauthorized role, prompt injection, and REST timeout after write.

Out of scope:

- Real OIDC/LDAP/SAML.
- OPA/Cedar policy engine.
- Production connector marketplace.
- HA/scaling/secrets rotation.
- Compliance certification.

## Success Criteria

- `npm run dev` starts a runnable prototype.
- `npm test` validates signed sessions, API route errors, policy, capabilities, transactions, planner fallback, evidence export, duplicate batch approval, retry recovery, and prompt-injection containment.
- `npm run verify` covers typecheck/lint, unit tests, production build, and Playwright E2E.
- The happy path changes seeded state exactly once per write action.
- Unauthorized actors are denied before destructive capabilities are minted.
- Failed connector steps can pause and retry without duplicate writes.
- Evidence packet includes actor, prompt, plan, approvals, policy decisions, capabilities, tool calls, full audit replay, audit root hash, and real redacted state diffs.

## Wedge-to-Platform Path

Start with access-sensitive IT operations. Add real enterprise auth, customer-specific connectors, richer policy engines, and admin tooling. Expand from offboarding into vendor onboarding, finance operations, compliance evidence collection, customer escalation cleanup, and internal data workflow repair. The platform becomes the broker for safe agent actions behind the firewall.
