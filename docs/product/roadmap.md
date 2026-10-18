# Roadmap

Milestones are sized for small, reviewable community contributions. Each milestone ends with working, tested software, not only documentation. Dates are intentionally omitted until maintainers commit capacity.

| Milestone | Goal | Key requirements | Exit criteria |
| --- | --- | --- | --- |
| **M0 — Foundation** ✅ docs only | Shared understanding | — | This documentation set, skills and agents reviewed |
| **M1 — Walking skeleton** ✅ 2026-10-16 (CI on GitHub pending) | Repo builds, deploys and isolates tenants | FR-001–003, FR-005, SEC-001–007, NFR-008–010 | npm workspaces scaffold (`apps/web` Next.js, `apps/api` Hono, `packages/contracts`, `packages/api-client`, `packages/config`); boundary lint rules; CI (lint, typecheck, test, build); Docker Compose MongoDB replica set; migration runner and identity/workspace collections; `TenantCollection`; auth; `requireMembership`; Next.js dev rewrite + `server-only` API helper; `/healthz` and `/readyz`; one cross-workspace isolation test |
| **M2 — Core Ops** (done 2026-10-17) | Agree original scope | FR-010–014, BR-004–005, BR-015, BR-029 | Clients, projects, requirements, baselines and tasks with UI and tests. Task links to change-request versions arrive with M3 |
| **M3 — Scope Guard** (done 2026-10-17, with AI) | Approvals with advisory AI | FR-020–029, FR-032, FR-050–054, BR-001–014, BR-026–028 | Version state machine, decisions, history UI and AI analysis. At the maintainer's request, the AI work of the original M4 moved into M3, and conversion to tasks (FR-030) moved to the delivery milestone |
| **M4 — Delivery and billable work** (done 2026-10-17) | Approved work becomes billable | FR-030, FR-040, FR-041, FR-015, BR-012, BR-015, BR-016 | Tasks from approved versions, billable entries with server eligibility, project delivery overview. The AI evaluation harness (originally M4) is still open |
| **M5 — Billing** (done 2026-10-18; not yet released, see [release audit §13](../quality/release-readiness-audit.md#13-final-release-closure-2026-10-19)) | Correct invoices | FR-042–FR-046, BR-017–025, BR-030 (FR-040, FR-041 and the eligibility service, BR-016, were delivered in M4) | Invoice drafts, issue with idempotency and gapless numbers, void, print |
| **M6 — MVP hardening** | Release candidate | Should Haves, A11Y, SC-1…SC-8 | E2E suite, accessibility checks, user sessions with validation audience, v0.1.0 release |

## After MVP (candidates, not commitments)

- Client approval via signed link (FR-031).
- GST-aware invoices, after OQ-002 is resolved with qualified advice.
- Multi-currency with recorded exchange rates.
- Local model presets (for example Ollama or llama.cpp server) documented and evaluated.
- Bengali UI translation (OQ-006).
- Templates gallery and community extension registry (FR-060, FR-062).
- Milestone billing for fixed-price projects (OQ-012).
- Integrations: Git hosting (link commits to tasks), calendar, email intake of change requests.
