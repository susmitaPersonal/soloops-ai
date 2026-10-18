# MVP Scope

The MVP proves one claim: **a freelancer can take a client's extra request through to an approved, traceable, correctly invoiced piece of work, and cannot accidentally bill or build unapproved scope.**

## In scope

Must Have requirements from [requirements.md](requirements.md), summarised by module:

| Module | MVP capabilities |
| --- | --- |
| Identity and workspace | Register, sign in/out, auto-created workspace, owner settings |
| Core Ops | Clients, projects, requirements, scope baselines, tasks |
| Scope Guard | Change requests, versioned proposals, AI-assisted drafting, deterministic pricing, propose/freeze, decision recording, revision, history, conversion to tasks |
| Billing | Billable entries, eligibility classification, invoice drafts with server-side calculation, owner-only issuing |
| Open AI | `none`, `mock` and `openai-compatible` provider adapters; workspace opt-in with disclosure; generation metadata |
| Audit | Append-only audit events for all critical transitions |

Should Have items (members, project overview, proposal summary, withdraw, draft editing and adjustments, print view, void, data export, audit log view) are included if capacity allows. They are tracked in [implementation status](../quality/implementation-status.md).

## Explicit exclusions

- Payments, payment links and gateways.
- GST-compliant tax invoices, e-invoicing and tax filing ([OQ-002](open-questions.md)).
- Currency conversion ([OQ-007](open-questions.md)).
- Client accounts or a client portal ([OQ-003](open-questions.md)). The signed approval link is a Could.
- Sending email or chat messages, and integrations with chat apps or Git hosting.
- Timers, calendars, Gantt charts, sprints and resource planning.
- Native mobile apps.
- Fine-tuning models. Bundling or hosting a model.
- **Permanently excluded:** AI approval of changes, AI-issued invoices, AI-initiated financial transactions, and paid tiers or paywalls in the open-source release.

## Success criteria

The MVP is successful when **all** of the following are measured and met. Record results in [implementation status](../quality/implementation-status.md):

| ID | Criterion | Measure |
| --- | --- | --- |
| SC-1 | End-to-end workflow works | The Playwright E2E for journey J2 + J4 (client → invoice issued) passes in CI. |
| SC-2 | Business rules are protected | Every BR-001…BR-030 maps to ≥ 1 passing automated test in the [traceability matrix](../quality/requirements-traceability.md). |
| SC-3 | Tenant isolation | The cross-workspace access test suite (TC-004.2 and the security matrix) passes for every tenant-scoped endpoint. |
| SC-4 | Usability with real users | At least 5 freelancers or team leads from the validation audience complete J1–J4 in a moderated session. At least 4 of 5 finish without help in ≤ 30 minutes. |
| SC-5 | Perceived value | At least 3 of 5 participants say they would use it on a real project. Record the reasons either way. |
| SC-6 | AI usefulness | For the chosen model configuration, ≥ 95% schema-valid outputs on the evaluation set, and reviewers rate ≥ 70% of proposals "useful with minor edits" or better. These are targets to measure, not current results. |
| SC-7 | Contributor onboarding | At least 2 new contributors reach a running app in ≤ 15 minutes using only the docs. |
| SC-8 | Zero-cost operation | The app runs end-to-end with `AI_PROVIDER=none` and no paid services. |
