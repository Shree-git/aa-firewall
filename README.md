# AA Firewall

AA Firewall is a secure agent framework prototype for internal enterprise operations.

The demo shows employee offboarding/access cleanup behind a firewall:

- natural language to a typed multi-step plan
- simulated SSO/RBAC
- policy-gated tool broker
- signed short-lived capabilities
- approval gates for destructive writes
- mock DB, REST, GraphQL, and legacy connectors
- chain-hashed audit replay and evidence export
- prompt-injection and connector-failure negative paths

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Test

```bash
npm test
npm run test:e2e
```

Set `OPENAI_API_KEY` to exercise the live planner path. Without it, the app uses a deterministic fallback plan for the seeded demo prompt.
