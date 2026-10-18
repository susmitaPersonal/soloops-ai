# CLAUDE.md — SoloOps AI

## What this is
SoloOps AI is an open-source (₹0, no paid tiers) operations assistant for **solo freelance developers and small freelance software teams**. It prevents unapproved scope changes and forgotten billable work by linking:

`Client → Project → Requirement → Change Request → Approval → Task → Billable Work → Invoice Draft`

**Current state:** milestones **M1 (walking skeleton)**, **M2 (Core Ops)**, **M3 (Scope Guard with advisory AI)**, **M4 (delivery and billable work)** and **M5 (invoices)** are implemented and tested: registration, sign-in, sessions, workspace isolation, workspace settings, clients, projects, requirements, scope baselines, tasks, change requests, versions, propose, hash-bound decisions, the approvals queue, AI analysis with an evidence-bound scope check (`none` / `mock` / `openai-compatible`; evaluated 2026-10-19 with `qwen2.5:1.5b` and `qwen2.5:7b`; both fail the thresholds, 7B also on costly "already covered" errors; no model recommended), tasks from approved versions (FR-030), billable entries with server eligibility (FR-040, FR-041), the project overview and invoices (FR-042–FR-046: drafts, owner issue, void, print). Workspace members (FR-004) are implemented ([ADR-0022](docs/architecture/adr/0022-scope-check-and-members.md)). The audit log UI and the dashboard are **not implemented**. Release status (current section §14; CI passed on `2332a69` including the scope check and members; manual browser run still open): [release readiness audit](docs/quality/release-readiness-audit.md#14-theme-alignment-ai-scope-check-and-members-2026-10-19). Do not describe them as working. Check [implementation status](docs/quality/implementation-status.md) for progress, the validation log and the exact next action.

## Read before you change anything
Consult the relevant documents **before** modifying a module. Never rely on conversation history alone.

| Task touches | Read first |
| --- | --- |
| Any feature | [business-rules.md](docs/product/business-rules.md), [requirements.md](docs/product/requirements.md) |
| Change requests / approvals | [change-request-lifecycle.md](docs/design/change-request-lifecycle.md), [ADR-0006](docs/architecture/adr/0006-versioned-approvals.md) |
| Billing / money | BR-016…027, [ADR-0007](docs/architecture/adr/0007-financial-calculations.md) |
| Stack, versions, tooling | [ADR-0016](docs/architecture/adr/0016-m1-implementation-choices.md), [monorepo structure](docs/architecture/monorepo-structure.md) |
| Core Ops (clients, projects, requirements, baselines, tasks) | [ADR-0017](docs/architecture/adr/0017-m2-core-ops-implementation-choices.md), [data-model.md](docs/architecture/data-model.md) §4.5–4.11 |
| Invoices, numbering, void | [ADR-0020](docs/architecture/adr/0020-m5-invoice-implementation-choices.md), data-model §4.13, BR-017…025 |
| Delivery, billable entries, eligibility | [ADR-0019](docs/architecture/adr/0019-m4-delivery-and-billable-work-implementation-choices.md), [workflows.md](docs/design/workflows.md) §4, data-model §4.12 |
| Scope check, members | [ADR-0022](docs/architecture/adr/0022-scope-check-and-members.md), BR-031, [AI evaluation results](docs/quality/ai-evaluation-results.md) |
| Scope Guard, idempotency, AI provider | [ADR-0018](docs/architecture/adr/0018-m3-scope-guard-and-ai-implementation-choices.md), [change-request-lifecycle.md](docs/design/change-request-lifecycle.md), [ai-architecture.md](docs/architecture/ai-architecture.md) |
| AI | [ai-architecture.md](docs/architecture/ai-architecture.md), [ADR-0005](docs/architecture/adr/0005-ai-provider-abstraction.md) |
| API / DB | [api-design.md](docs/architecture/api-design.md), [data-model.md](docs/architecture/data-model.md), [ADR-0012](docs/architecture/adr/0012-mongodb-and-data-access.md) |
| UI, screens, user flows | [ui-ux-design-system.md](docs/design/ui-ux-design-system.md), [screen-specifications.md](docs/design/screen-specifications.md), [workflows.md](docs/design/workflows.md) |
| Monorepo / web-API boundary | [monorepo-structure.md](docs/architecture/monorepo-structure.md), [ADR-0011](docs/architecture/adr/0011-monorepo-packages-and-contracts.md), [ADR-0013](docs/architecture/adr/0013-web-api-communication.md) |
| Auth / tenancy | [security-architecture.md](docs/architecture/security-architecture.md) |

Full index: [docs/README.md](docs/README.md). Precedence on conflict: business rules and requirements → accepted ADRs → architecture and design docs → code → conversation.

## Repository structure
- `docs/`: product, design, architecture (+ `adr/`), engineering, quality, contributing.
- `.claude/skills/soloops-*`: reusable procedures. `.claude/agents/`: specialist reviewers.
- `scripts/check-docs.mjs`: docs link and frontmatter checker.
- Implemented (M1–M5): `apps/web` (Next.js App Router, presentation only), `apps/api` (Hono modular monolith with the `identity`, `workspace`, `audit`, `core-ops`, `scope-guard`, `billing` and `ai` modules: all business logic and MongoDB access; migrations in `apps/api/migrations`), `packages/contracts` (Zod DTOs, isomorphic), `packages/api-client` (typed fetch), `packages/config` (tsconfig, ESLint boundaries), `e2e/` (Playwright). See [monorepo-structure.md](docs/architecture/monorepo-structure.md).

## Stack
TypeScript 6 strict · Next.js 16 App Router, React 19, React Hook Form · Node 22, Hono, Zod 4, pino · MongoDB replica set with the native driver · Vitest, in-process Hono requests on real MongoDB, RTL, Playwright · npm workspaces. ADRs 0009–0014 supersede 0001, 0002 and 0008. Exact versions and M1 tooling choices: [ADR-0016](docs/architecture/adr/0016-m1-implementation-choices.md).

## Critical invariants (never violate)
1. **AI suggests, humans decide.** AI never proposes, approves, rejects, prices, issues or voids. The `ai` module has no write path to domain modules (BR-001–003).
2. **Approvals bind to an immutable version and its content hash.** Any change after propose means a new version and a new decision (BR-006–014).
3. **Only `APPROVED` versions authorise work.** Pending, rejected or withdrawn work is never taskable or invoiceable (BR-012, BR-016, BR-017).
4. **Money is integer minor units, computed server-side** with the shared pure functions. No floats, and client totals are ignored (BR-019–022).
5. **Only owners issue or void invoices.** Issued invoices are immutable, and numbering is gapless and transactional (BR-023, BR-024).
6. **Every tenant query is scoped by `workspaceId`** after a membership check, through `TenantCollection` only. A foreign ID returns `404` (SEC-004).
7. **Critical transitions write audit events in the same transaction** (BR-028).
8. Estimates are ranges with assumptions, and never guarantees (BR-026).
9. **MongoDB and business logic live only in `apps/api`.** `apps/web` and `packages/*` never import `mongodb`, `hono` or server code. Contracts carry DTOs, not persistence models. Next.js never caches per-user data and runs no business mutations (ADR-0009, 0011, 0013).

## Security essentials
argon2id, opaque server-side sessions, HttpOnly/Secure/SameSite cookies, CSRF header plus Origin check, Zod on all inputs, rate limits on auth and AI, secrets only from env and never logged, minimised AI payloads, model output rendered as text.

## Coding conventions
See [coding-standards.md](docs/engineering/coding-standards.md). Key points:
- Modules import each other only via `index.ts`. Only `apps/api/src/platform/db` imports `mongodb`.
- Repositories take `workspaceId` first and use `TenantCollection`.
- Services take `ctx`.
- Pure logic goes in `domain/`.
- Use an injected clock.
- Reference rule IDs in code comments and test names (`BR-010`, `TC-012.3`).

## Validation commands
- `npm run validate`: lint, typecheck, tests, build, docs check. `npm test` uses a real MongoDB replica set (in-memory via `mongodb-memory-server`, or `docker compose up -d mongo` with `MONGODB_URI_TEST`).
- `npm run test:e2e` (after `npm run build`; `npx playwright install chromium` once).
- `node scripts/check-contrast.mjs` whenever colour tokens change.
- **Report only commands you actually ran, with their real output.** Never claim tests pass without running them.

## Definition of done
Follow [definition-of-done.md](docs/engineering/definition-of-done.md): ACs met, server-side rules, validation and authorisation, UI states, tests that pass, isolation matrix updated, docs + traceability + status updated, limitations recorded.

## Skills: when to invoke
| Situation | Skill |
| --- | --- |
| Unsure about product scope, terminology or whether something is in MVP | `soloops-product-context` |
| Turning a requirement or idea into workflows and ACs | `soloops-solution-design` |
| Adding modules, dependencies, cross-module calls, or any material design change | `soloops-architecture` |
| Implementing any feature or fix | `soloops-feature-development` (it pulls in the others as needed) |
| Anything touching prompts, providers, AI output or AI UI | `soloops-ai-engineering` |
| Writing or reviewing tests | `soloops-testing` |
| Changes to auth, tenancy, money, approvals, AI data flow, dependencies | `soloops-security-review` |
| Behaviour, API, schema or rule changes, and before finishing a PR | `soloops-documentation` |

## Agents: when to delegate
Use agents for **bounded review or analysis tasks**, not for routine edits: `product-analyst`, `solution-architect`, `ai-engineer`, `test-engineer`, `security-reviewer`, `documentation-reviewer`.
- Reviewer agents are read-only by design. They report findings with evidence, affected files, severity and recommendations.
- Never run two agents that edit the same files concurrently. The main session applies changes after reviewing agent findings.

## When behaviour changes
Update in the **same change**:
- requirements or BRs (if rules changed)
- design and architecture docs
- API and data model
- an ADR (if material)
- the traceability matrix
- implementation status
- known limitations

Then run the docs check. Never renumber IDs.
