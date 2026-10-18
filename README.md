# SoloOps AI

**Open-source operations assistant for freelance software developers and small teams.** It connects requirements, change requests, client approvals, delivery tasks and invoice drafts in one traceable workflow, so unapproved scope never gets built or billed by accident.

```text
Client → Project → Requirement → Change Request → Approval → Task → Billable Work → Invoice Draft
```

> **Project status: release candidate.** M1–M5 plus **workspace members** (FR-004) and the **AI scope check** (FR-021) are implemented and pass the full local test suite. The repository is published, and both CI jobs passed on `2332a69`, which includes the scope check and members ([run](https://github.com/susmitaPersonal/soloops-ai/actions/runs/39166807492)). Still open: a manual development-server and browser run ([release audit §14](docs/quality/release-readiness-audit.md#14-theme-alignment-ai-scope-check-and-members-2026-10-19)). Working and tested: registration, sign-in, sessions, workspace isolation, members, billing settings, clients, projects, requirements, scope baselines, tasks, **change requests with immutable hash-bound versions, an evidence-bound AI scope check, recorded client decisions**, **tasks from approved change requests, billable work with server-side eligibility, and invoice drafts with owner-only issue, gapless numbers, void and print**. Invoices are drafts with a single tax rate, not GST-compliant tax invoices. The AI scope check was evaluated with two local open-weight models (`qwen2.5:1.5b` and `qwen2.5:7b`). **Both failed** the pre-set thresholds, so no model is recommended ([results](docs/quality/ai-evaluation-results.md)). See [implementation status](docs/quality/implementation-status.md) and the [roadmap](docs/product/roadmap.md). Built for Hacktoberfest 2026, Week 2.

## Why

Freelancers get extra requests over chat and calls, say yes, and later can't prove what was agreed or remember what to bill. SoloOps AI:

- **Baselines** the original scope.
- **Checks each extra ask against the agreed requirements** with an open-weight model: new scope, a change to agreed scope, already covered, or unclear. It shows the evidence and the questions to ask the client. The app keeps only verdicts that real, agreed requirements support, and you confirm the verdict.
- Turns the ask into a **versioned proposal**, which the AI helps draft from the client's raw message.
- Records the **client's decision against an exact, hashed version**.
- Only lets **approved** work become tasks and invoice lines.
- Computes invoice totals **deterministically**. AI never approves, prices or invoices anything.

## Free and open

- Licensed under [MIT](LICENSE) (confirmed by the maintainer on 2026-10-18, [OQ-001](docs/product/open-questions.md)). Free for everyone, with no paid tiers.
- Functional modules: **Core Ops**, **Scope Guard**, **Billing** and **Open AI** (adapters for open-weight models) are implemented. **Community** (templates, integrations, data export) is planned and **not built yet**. These are modules, not pricing tiers.
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

AI only **suggests**: a scope verdict with evidence, change-request details, questions for the client and an uncertain effort range. People confirm the verdict and the effort, prices are computed by the server, and only a recorded client decision approves anything. A verdict whose evidence does not hold up (an invented requirement, one that is not agreed, or contradictory citations) is shown as **Unclear**, with the reason. If the AI times out, fails or returns invalid output, the draft stays unchanged and the user continues manually.

**Verification status:** the adapter is tested against a local HTTP stub, and the fallback with the mock provider. With a real open-weight model, **Ollama 0.40.5 serving `qwen2.5:1.5b` locally** (inference on the same machine; no external AI API), the AI service and UI ran end to end on 2026-10-18 and 2026-10-19. The scope check was then **evaluated** on 23 synthetic cases × 3 runs against thresholds fixed in advance ([results](docs/quality/ai-evaluation-results.md)):
  - It **passed** schema validity (100%), invented references (3%), agreement across runs (87%), and **0% wrong "already covered"** verdicts, the costly mistake.
  - It **failed** verdict accuracy: 30% against a 70% threshold. Most verdicts end as Unclear because this small model's evidence contradicts its own verdicts.

  A larger model, **`qwen2.5:7b`**, was then evaluated the same way:
  - Its own judgement was better: 71% of its raw verdicts were right, and it cited no invented requirements.
  - Its final accuracy was 46% (threshold 70%).
  - It **failed the safety threshold**: 14% of its answers wrongly said "already covered", against a 5% limit.
  - The server rules still caught its prompt-injection answers.

  The integration is proven, but **neither model's scope verdicts are reliable, and no model is recommended**. Every verdict stays a suggestion that a person confirms. Use `AI_STRUCTURED_OUTPUT=json_schema` for small local models. Re-run `npm run eval:ai` for any other model. See [environment configuration](docs/engineering/environment-configuration.md) and [AI architecture](docs/architecture/ai-architecture.md).

## Testing

The strategy and commands are in the [testing strategy](docs/architecture/testing-strategy.md). The cases are in the [test plan](docs/quality/test-plan.md).

```bash
npm run validate     # lint, typecheck, unit + component + API integration (real MongoDB replica set, no Docker needed), build, docs check
npm run test:e2e     # Playwright, after npm run build
```

## Current limitations

- Invoices are **drafts with one tax rate**, not GST-compliant tax invoices. There are no payments, credit notes or e-invoicing.
- Teams: owners add people who already have an account as members. There are no invitations, role changes or ownership transfer, and only owners issue or void invoices.
- Client approvals are recorded by the freelancer (with evidence and a content hash), not signed by the client.
- AI scope verdicts are **not reliable** with either evaluated model: `qwen2.5:1.5b` reached 30% accuracy, and `qwen2.5:7b` reached 46% with 14% costly "already covered" errors, against thresholds of 70% and 5%. Effort estimates are unevaluated. The app shows Unclear rather than a wrong verdict, and a person always decides.

Full list: [known limitations](docs/quality/known-limitations.md). Release status: [release readiness audit](docs/quality/release-readiness-audit.md).

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md), then the full [contribution guide](docs/contributing/contribution-guide.md). The full documentation index is at [docs/README.md](docs/README.md). Claude Code users should also read [CLAUDE.md](CLAUDE.md).

## License

[MIT](LICENSE) © SoloOps AI contributors.
