# SoloOps AI

**Open-source operations assistant for freelance software developers and small teams.** It connects requirements, change requests, client approvals, delivery tasks and invoice drafts in one traceable workflow, so unapproved scope never gets built or billed by accident.

```text
Client → Project → Requirement → Change Request → Approval → Task → Billable Work → Invoice Draft
```

> **Project status: Invoices (M5), pending release review.** Registration, sign-in, sessions, workspace isolation, billing settings, clients, projects, requirements, scope baselines, tasks, **change requests with immutable hash-bound versions, recorded client decisions, advisory AI analysis** (OpenAI-compatible endpoint or none), **tasks from approved change requests, billable work with server-side eligibility, and invoice drafts with owner-only issue, gapless numbers, void and print** work and are tested. Invoices are drafts with a single tax rate, not GST-compliant tax invoices. Member management is not implemented yet. No AI model has been evaluated or is recommended. See [implementation status](docs/quality/implementation-status.md) and the [roadmap](docs/product/roadmap.md). Built for Hacktoberfest 2026, Week 2.

## Why

Freelancers get extra requests over chat and calls, say yes, and later can't prove what was agreed or remember what to bill. SoloOps AI:

- **Baselines** the original scope.
- Turns each extra ask into a **versioned proposal**, which AI can help draft from the client's raw message.
- Records the **client's decision against an exact, hashed version**.
- Only lets **approved** work become tasks and invoice lines.
- Computes invoice totals **deterministically**. AI never approves, prices or invoices anything.

## Free and open

- Licensed under [MIT](LICENSE) (confirmed by the maintainer on 2026-10-18, [OQ-001](docs/product/open-questions.md)). Free for everyone, with no paid tiers.
- Functional modules: **Core Ops**, **Scope Guard**, **Billing**, **Open AI** (adapters for open-weight models) and **Community**. These are modules, not pricing tiers.
- **No proprietary AI API required.** AI is optional and off by default. Point it at any OpenAI-compatible endpoint serving an open-weight model, whether hosted or self-hosted. A hosted endpoint, server or database may cost money, and the app itself does not.

## Stack

Next.js (App Router) + React + TypeScript for the web · Node.js + Hono + Zod for the API · MongoDB (replica set, native driver) · shared Zod contracts in an npm-workspaces monorepo (`apps/web`, `apps/api`, `packages/contracts`, `packages/api-client`, `packages/config`) · Vitest, RTL and Playwright. See the [architecture overview](docs/architecture/architecture-overview.md) and [ADRs](docs/architecture/adr/README.md).

## Getting started

Requires Node.js 22 (≥ 22.12) and npm 10. Docker is optional (for the development database).

```bash
npm ci
cp apps/api/.env.example apps/api/.env      # set SESSION_SECRET (see the file)
cp apps/web/.env.example apps/web/.env.local
docker compose up -d mongo                  # MongoDB single-node replica set
npm run db:migrate
npm run dev                                 # web on http://localhost:3000, API on :4000
```

Then open http://localhost:3000 and create a workspace. Details, and which steps have been verified, are in [local development](docs/engineering/local-development.md).

If port 27017 is already used by another MongoDB, see [troubleshooting](docs/engineering/troubleshooting.md): remapping the Compose port also needs `directConnection=true` in `MONGODB_URI`.

## AI configuration

AI is **optional and off by default** (`AI_PROVIDER=none`). To use it, point `AI_PROVIDER=openai-compatible` at any OpenAI-compatible endpoint that serves an open-weight model (`AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY` only if the endpoint needs one), then an owner turns AI on in Settings. `AI_PROVIDER=mock` gives deterministic test answers and is refused in production.

AI only **suggests** change-request details and an effort range. People confirm the effort, prices are computed by the server, and only a recorded client decision approves anything. If the AI times out, fails or returns invalid output, the draft stays unchanged and the user continues manually.

**Verification status:** the adapter is tested against a local HTTP stub, and the fallback with the mock provider. One **integration smoke test with a real open-weight model** passed on 2026-10-18: Ollama 0.40.5 serving `qwen2.5:1.5b` locally, through the real UI. With `AI_STRUCTURED_OUTPUT=json_schema`, 4 of 4 analyses passed schema validation; with the default `prompt` mode only 1 of 4 did, and the rest fell back safely ([release audit §12](docs/quality/release-readiness-audit.md#12-release-closure-sprint-2026-10-18)). For small local models, set `AI_STRUCTURED_OUTPUT=json_schema`. This proves the integration, **not** estimate quality: no model is evaluated or recommended until it passes the documented evaluation. See [environment configuration](docs/engineering/environment-configuration.md) and [AI architecture](docs/architecture/ai-architecture.md).

## Testing

The strategy and commands are in the [testing strategy](docs/architecture/testing-strategy.md). The cases are in the [test plan](docs/quality/test-plan.md).

```bash
npm run validate     # lint, typecheck, unit + component + API integration (real MongoDB replica set, no Docker needed), build, docs check
npm run test:e2e     # Playwright, after npm run build
```

## Current limitations

- Invoices are **drafts with one tax rate**, not GST-compliant tax invoices. There are no payments, credit notes or e-invoicing.
- One owner per workspace in practice: member management (FR-004) is not built yet.
- Client approvals are recorded by the freelancer (with evidence and a content hash), not signed by the client.
- AI estimates are unevaluated: one small local model passed an integration smoke test only (see above).

Full list: [known limitations](docs/quality/known-limitations.md). Release status: [release readiness audit](docs/quality/release-readiness-audit.md).

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md), then the full [contribution guide](docs/contributing/contribution-guide.md). The full documentation index is at [docs/README.md](docs/README.md). Claude Code users should also read [CLAUDE.md](CLAUDE.md).

## License

[MIT](LICENSE) © SoloOps AI contributors.
