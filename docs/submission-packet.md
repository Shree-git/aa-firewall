# Submission Packet

Demo video (2-5 min, core workflow):
https://youtu.be/LFnXsqa_2_4

PRD:
https://docs.google.com/document/d/15Fv_YN780SQZ8J1VFeZwZ4UNbPC_HxCbsHxDei3XBF8/edit?usp=sharing

TDD:
https://docs.google.com/document/d/1eqxT8G0eCuo0zsWK66Vd323ssiS1VpPeccovpLwcqDU/edit?tab=t.0

Prototype:
https://aa-firewall.vercel.app/

Source code:
https://github.com/Shree-git/aa-firewall

Access notes / credentials:
1. Clone/Fork the codebase: No credentials are required for the main demo. The app runs locally with deterministic fallback planning: `npm install && npm run dev`, then open http://localhost:3000. For live LLM planning, create an untracked `.env.local` from `.env.example` and set `OPENROUTER_API_KEY`. Local `CAPABILITY_SECRET` and `SESSION_SECRET` can also be set there, but they are not needed for the fallback demo.
2. Using Vercel link: https://aa-firewall.vercel.app/. No need to setup anything.

What I personally built:
I built the AA Firewall prototype end to end: the Next.js demo UI, signed demo sessions, RBAC checks, typed agent planning flow, capability-bound connector execution, batch human approval, local protocol-gated internal systems, Live Systems panel, Security Probe, transactional audit/idempotency layer, evidence export, negative-path demos, tests, and reviewer docs.

What I reused:
I reused standard open-source framework and infrastructure pieces: Next.js, React, TypeScript, Zod, better-sqlite3, graphql, Vitest, Playwright, lucide-react, and OpenRouter chat completions for optional live planning. The enterprise systems are local stand-ins, but the security, workflow, approval, connector, audit, and evidence logic were implemented for this prototype.

What broke and how I debugged it:
A few things broke while building. `next lint` was incompatible with the installed Next.js version, so I replaced the lint script with TypeScript typechecking and made `npm run verify` chain typecheck, tests, build, and Playwright E2E. The REST timeout scenario also exposed a real workflow risk: a write can succeed before the connector reports failure. I debugged that by adding stable idempotency keys and tests proving retry recovers without duplicating the ticket transfer. I also added capability probe tests for missing token `401`, wrong-scope token `403`, and valid write token `200` so the security boundary was visible and verifiable.

Thanks,
