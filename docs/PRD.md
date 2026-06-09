# PRD: AA Firewall

## Product Thesis

Large companies rely on fragile internal scripts, dashboards, and manual operating procedures that break when key operators leave or when workflows span too many internal systems. AA Firewall is a secure agent execution layer for internal operations: a behind-the-firewall agent that turns natural language into multi-step actions while enforcing identity, permissions, approvals, and auditability at every step.

The prototype starts with employee offboarding and access cleanup. This workflow is painful, common, access-sensitive, and easy for reviewers to understand. It requires reading and writing across internal systems, but it cannot safely be handled by an unconstrained LLM wrapper.

## Target User and Buyer

Primary user: IT operations, security operations, or internal platform teams responsible for access cleanup, ticket ownership transfer, and legacy-system administration.

Economic buyer: CIO, CISO, or VP Internal Tools at a large enterprise where internal workflows are brittle, compliance-sensitive, and spread across databases, APIs, and legacy systems.

## Prototype Workflow

The user asks:

> Offboard Alex Chen effective today: find all systems Alex has access to, check open customer escalations, transfer ownership to Priya Shah, revoke SaaS and database access, disable legacy billing access, and produce an audit report.

The app shows natural-language intake, typed plan, actor/role selection, connector activity, approval gates, signed capabilities, audit replay, and evidence export.

## Scope

In scope: Next.js TypeScript modular monolith, simulated SSO/RBAC, mock DB/REST/GraphQL/legacy connectors, policy-gated broker, HMAC capabilities, approval gates, chain-hashed audit, evidence export, failure recovery, and prompt-injection red-team fixture.

Out of scope: real enterprise integrations, production SAML/OIDC/LDAP, external OPA/Cedar, Temporal, broad connector marketplace, HA/scaling/secrets rotation, and compliance certification.

## Success Criteria

- `npm run dev` starts the runnable prototype.
- `npm test` validates policy, capabilities, connector contracts, approval gates, audit hashing, failure recovery, and prompt-injection blocking.
- The happy-path demo changes seeded state exactly once per write action.
- Unauthorized roles are denied before write capabilities are minted.
- Failed connector steps can pause and retry without duplicate writes.
- Audit replay reconstructs successful and failed runs.
- Evidence packet includes actor, prompt, plan, policy decisions, capabilities, approvals, connector calls, state diffs, audit root hash, and final report.

## Wedge-to-Platform Path

Start with access-sensitive IT operations. Then add real OIDC/LDAP and OPA/Cedar, replace mocks with customer-specific connectors, add workflows such as vendor onboarding and compliance evidence collection, and expand the broker into an enterprise control plane for safe agent actions behind the firewall.
