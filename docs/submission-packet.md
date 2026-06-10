# Submission Packet

Demo video (2-5 min, core workflow):
TBD

PRD:
`docs/PRD.md`

TDD:
`docs/TDD.md`

Prototype:
Local: `npm install && npm run dev`, then open `http://localhost:3000`

Source code:
TBD GitHub or zip snapshot

Access notes / credentials:
No credentials are needed for fallback demo mode. For live planner mode, create untracked `.env.local` from `.env.example` and set `OPENROUTER_API_KEY`.

What I personally built:
Secure agent workflow prototype with signed demo sessions, RBAC, capability-bound connector execution, local protocol-gated internal systems, Live Systems UI, Security Probe, batch approval, transactional audit/idempotency, evidence export, negative-path demos, tests, and reviewer docs.

What I reused:
Next.js, React, Zod, better-sqlite3, graphql, Vitest, Playwright, lucide-react, and OpenRouter chat completions for optional live planning.

What broke and how I debugged it:
The original `next lint` script was incompatible with the installed Next version, so lint now aliases TypeScript typecheck and `verify` chains typecheck, unit tests, build, and E2E. The REST timeout demo intentionally pauses after a committed transfer; retry is validated through the operation idempotency key and recovered connector event.

Thanks,
