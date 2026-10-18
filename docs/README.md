# SoloOps AI Documentation

Start here. Documents marked **authoritative** win in conflicts ([precedence](engineering/repository-guide.md#authoritative-sources-precedence)).

> **Current state:** milestones **M1–M5** are implemented and tested: workspace and sessions, Core Ops, Scope Guard with advisory AI, delivery and billable work, and invoices. Member management, the audit log UI, the dashboard and Community are **not implemented yet**. See [implementation status](quality/implementation-status.md) and the [release readiness audit](quality/release-readiness-audit.md).

## Product
| Document | Purpose |
| --- | --- |
| [Product overview](product/product-overview.md) | Problem statement, vision, value proposition, modules, zero-cost commitments |
| [Personas and user journeys](product/personas-and-user-journeys.md) | Who it's for (hypotheses), journeys J1–J5, permissions |
| [Requirements](product/requirements.md) **(authoritative)** | FR, NFR, SEC, PRV, A11Y, ERR with stable IDs and MoSCoW |
| [Business rules](product/business-rules.md) **(authoritative)** | BR-001…030 invariants |
| [Acceptance criteria](product/acceptance-criteria.md) | User stories US-xxx and AC-xxx.k |
| [MVP scope](product/mvp-scope.md) | Inclusions, exclusions, measurable success criteria |
| [Roadmap](product/roadmap.md) | Milestones M0–M6 and post-MVP candidates |
| [Open questions](product/open-questions.md) | Unresolved decisions with working assumptions |

## Design
| Document | Purpose |
| --- | --- |
| [Solution design](design/solution-design.md) | How each feature solves the problem |
| [Change-request lifecycle](design/change-request-lifecycle.md) **(authoritative)** | Version state machine and transitions |
| [Workflows and user flows](design/workflows.md) | System sequences, eligibility decision, user flows UF-1…UF-5 |
| [UI/UX design system](design/ui-ux-design-system.md) | Principles, colour tokens (contrast-checked), typography, spacing, components |
| [Screen specifications](design/screen-specifications.md) | Information architecture, screens S-01…S-16, states, UX acceptance criteria |

## Architecture
| Document | Purpose |
| --- | --- |
| [Architecture overview](architecture/architecture-overview.md) | Components, request flow, business workflow, dependency rules |
| [Monorepo structure](architecture/monorepo-structure.md) | Workspaces (`apps/web`, `apps/api`, `packages/*`), boundaries, scripts |
| [Frontend](architecture/frontend-architecture.md) · [Backend](architecture/backend-architecture.md) | Application structure |
| [Data model](architecture/data-model.md) | MongoDB collections, JSON examples, data dictionary, indexes, access patterns, integrity, retention |
| [API design](architecture/api-design.md) | Conventions, endpoint inventory, examples |
| [AI architecture](architecture/ai-architecture.md) | Provider abstraction, schemas, safety, evaluation |
| [Security](architecture/security-architecture.md) · [Deployment](architecture/deployment-architecture.md) · [Testing strategy](architecture/testing-strategy.md) | Cross-cutting |
| [ADRs](architecture/adr/README.md) **(authoritative once accepted)** | Architecture decisions 0001–0016 (0001, 0002 and 0008 superseded) |

## Engineering
[Coding standards](engineering/coding-standards.md) · [Repository guide](engineering/repository-guide.md) · [Local development](engineering/local-development.md) · [Environment configuration](engineering/environment-configuration.md) · [Troubleshooting](engineering/troubleshooting.md) · [Definition of done](engineering/definition-of-done.md)

## Quality
[Traceability matrix](quality/requirements-traceability.md) · [Testing strategy](quality/testing-strategy.md) · [Test cases](quality/test-cases.md) · [Test plan](quality/test-plan.md) · [Test execution report](quality/test-execution-report.md) · [Risk register](quality/risk-register.md) · [Known limitations](quality/known-limitations.md) · [Implementation status](quality/implementation-status.md) · [Release readiness audit](quality/release-readiness-audit.md)

## Contributing
[Contribution guide](contributing/contribution-guide.md) · [PR checklist](contributing/pull-request-checklist.md) · [Issue guidelines](contributing/issue-guidelines.md) · [Code of conduct](contributing/code-of-conduct.md)

## Background
[Repository assessment (2026-10-16)](repository-assessment.md)

## Keeping docs healthy
- Update docs in the **same PR** as behaviour changes ([definition of done](engineering/definition-of-done.md)).
- Run `node scripts/check-docs.mjs` to verify links, anchors and Claude Code frontmatter.
- Never renumber IDs. Withdraw them instead.
