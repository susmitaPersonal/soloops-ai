# Known Limitations

## Current state (2026-10-19, release closure)

The current verification status, with evidence, is in [release readiness audit §13](release-readiness-audit.md#13-final-release-closure-2026-10-19).

- **Milestones M1–M5 are implemented:** registration, sign-in/out, sessions, workspace isolation, workspace settings, clients, projects, requirements, scope baselines, tasks, change requests with hash-bound decisions, the approvals queue, advisory AI analysis, tasks from approved versions, billable work with server eligibility, the project overview (M4), and invoice drafts, owner issue with gapless numbers, void and print (M5). Member management (FR-004), the audit log UI (FR-016), the dashboard (FR-017) and Community features do not exist yet.
- **No model has been evaluated** (ai-architecture §7). The `openai-compatible` adapter is verified against a local HTTP stub, plus one integration smoke test with a real open-weight model on 2026-10-18: Ollama `qwen2.5:1.5b`, 4/4 schema-valid with `AI_STRUCTURED_OUTPUT=json_schema` and 1/4 with `prompt` ([release audit §12](release-readiness-audit.md#12-release-closure-sprint-2026-10-18)). Its effort ranges varied widely between identical requests (10–40 h and 50–150 h), so estimate quality is unproven. A repeat on 2026-10-19 called the AI service directly, without the UI, with the same model: 3/3 schema-valid in each mode. Identical requests again gave ranges from 10–30 h to 100–400 h ([release audit §13](release-readiness-audit.md#13-final-release-closure-2026-10-19)). The UI does not yet warn that estimates are unevaluated.
- **CI has not run on GitHub.** The repository has no remote yet, so GitHub Actions has never run (P0, release audit §13).
- **Docker Compose MongoDB** was verified on 2026-10-18 on the maintainer machine: 746 API tests and 33 E2E tests passed against it (release audit [§11](release-readiness-audit.md#11-checklist-audit-second-pass-2026-10-18), [§12.3](release-readiness-audit.md#123-commands-run-this-sprint-and-results)). It has not been repeated since and never on Linux: the CI `docker-mongodb` job will do that. Default test runs use `mongodb-memory-server` (a real `mongod`, no Docker).
- **Not verified yet:** `npm run dev` with a browser walk-through by a person, a human fresh-clone trial, and Linux or macOS runs.

## Implementation limitations (M1)

| Limitation | Reason / reference |
| --- | --- |
| Rate limits are in memory, per API process, and reset on restart. Several API replicas need a shared store | [ADR-0016](../architecture/adr/0016-m1-implementation-choices.md) §9 |
| Registration still reveals whether an email is registered (201 vs a generic 422). Removing this needs an email-verification flow, which needs email sending (out of MVP scope). Per-IP limits slow probing | AC-001.2, SEC-006 |
| A per-email limit (50 per 15 min) lets someone who knows an email delay that user's sign-in for up to 15 minutes. It is set well above the per-IP + email limit to make this costly | SEC-006 |
| `TRUST_PROXY=true` assumes exactly one reverse proxy that appends the client address to `X-Forwarded-For`. Other topologies need a code or configuration change | [environment configuration](../engineering/environment-configuration.md) |
| Rotating `SESSION_SECRET` signs every user out (no multi-key support) | ADR-0016 §6 |
| `next.config.ts` rewrites are fixed at build time: set `API_INTERNAL_URL` before `next build` if the API is not on `localhost:4000` | ADR-0016 Consequences |
| No OpenAPI document. `api-design.md` and the Zod contracts are the API reference | [ADR-0021](../architecture/adr/0021-openapi-deferred-beyond-mvp.md) (deferred beyond the MVP release) |
| No manual System/Light/Dark theme toggle yet: dark mode follows the system setting only | OQ-017 |
| Navigation shows Home, Approvals, Clients, Projects, Billing and Settings; there is no dashboard (FR-017). Below 1024 px the sidebar becomes a wrapping top bar, not the specified focus-trapped drawer | Design system §7.3 (drawer not built in M2) |
| UI strings are not yet centralised for translation | NFR-013 (Should) |
| Members management (FR-004) and the audit log (S-13) are not in Settings yet. The AI section is (FR-053, FR-054) | FR-004, FR-016 |

## Implementation limitations (M2 Core Ops)

| Limitation | Reason / reference |
| --- | --- |
| The task assignee picker offers only "Unassigned" and "Me", and tasks assigned to other members show "Another member". The API accepts any member's ID | FR-004 (member API) is not built |
| Lists show 50 items with a "Load more" link (clients, projects), or the 100 most recent tasks. There is no search, sorting or assignee filter in the UI, although the API filters tasks by status and assignee | S-02, S-09 |
| No unarchive. Archiving is one-way in the MVP, as specified | FR-010, FR-011 |
| The task assignee's membership is checked outside the write transaction. A membership removed at that exact moment could still be assigned. Member removal (FR-004) does not exist yet | AC-016.2, ADR-0017 Security implications |
| Any member can archive a client or project, and there is no unarchive. This follows api-design §4 (Auth = M); making archive owner-only, or adding unarchive, is a product decision once members exist | FR-010, FR-011 |
| At most 500 active requirements per project | ADR-0017 §10 |
| Requirement add and edit use an inline form, and criteria are typed one per line, instead of the specified side drawer and repeatable list. Dialogs use the native `<dialog>` element, not Radix | S-05, design system §7.8, ADR-0017 §12 |
| `Idempotency-Key` is processed on Scope Guard transitions, task conversion, entry creation and every invoice transition (required on issue and void) | ADR-0018 §6, ADR-0019, ADR-0020 |

## Implementation limitations (M3 Scope Guard and AI)

| Limitation | Reason / reference |
| --- | --- |
| Clients don't sign anything: the freelancer records the client's decision with name, date, channel and evidence (hash-bound). A signed client link is post-MVP | ADR-0006, FR-031 (Could) |
| The AI rate limit and the "one concurrent analysis per version" guard are in memory per API process | ADR-0018 Consequences |
| No AI evaluation harness or dataset yet; no model is recommended | ai-architecture §7 |
| The analysis request is not cancellable server-side: Cancel in the UI stops waiting, but the provider call runs until it finishes or times out | ai-architecture §6 |
| The draft editor uses one-per-line text areas for list fields and a simple risk list, not the specified repeatable inputs; the AI panel is shown above the form, not beside it on wide screens | S-07 |
| `daysSince` "waiting N days" is computed in the browser and server time zones and may differ by one around midnight | S-07, S-15 |

## Implementation limitations (M4 delivery and billable work)

| Limitation | Reason / reference |
| --- | --- |
| Billable entries can be logged and deleted in the UI; **editing** an entry is available through the API (`PATCH`) only | S-10, ADR-0019 §11 |
| The billable-entry list returns the newest 500 entries with a `truncated` flag; totals then cover only those entries. No pagination | ADR-0019 §9 |
| The Log work picker offers billable tasks, requirements and **approved** change-request versions. Logging work against a pending version is possible through the API only (it is then classified `CR_NOT_APPROVED`) | AC-017.2, S-10 |
| Converted task titles are the acceptance-criterion text cut to 200 characters; the task list shows which CR version a task belongs to, not which criterion | FR-030, ADR-0019 §3 |
| Task status changes are free (`TODO` ↔ `IN_PROGRESS` ↔ `DONE`): the documents define no task state machine, and "all acceptance criteria done" is not checked or reported. Recorded as a documentation gap for the product owner | FR-014, AC-016.2 |
| An entry's scope is a snapshot of its task's scope at logging time; re-linking the task later does not move logged work | data-model §4.12, ADR-0019 Alternatives |
| No audit events for entry create, edit or delete (not in the BR-028 critical list) | ADR-0019 Consequences |
| Amounts and the eligible total on S-10 and the overview are previews. Invoice totals are recomputed in the invoice transactions | BR-017, BR-020 |

## Implementation limitations (M5 invoices)

| Limitation | Reason / reference |
| --- | --- |
| Invoices are drafts with one tax label and rate, **not GST-compliant tax invoices**. There is no HSN/SAC, place of supply, CGST/SGST split, e-invoicing, credit notes, payments or reminders | OQ-002, ADR-0020 Consequences |
| The tax label and rate are copied when the draft is created. Changing the workspace tax rate later does not change existing drafts; delete and redraft them | ADR-0020 §3 |
| The print view relies on the browser's "Print / Save as PDF"; there is no server-generated PDF | FR-045 |
| The "Unbilled by project" tab of S-16 is not built: unbilled work is reviewed per project (S-10) | S-16 |
| Draft line edits and draft deletion are not audited (only create, issue and void are, per BR-028) | BR-028, ADR-0020 §4 |
| A member cannot be added through the UI or API (FR-004), so the owner-only UI path (E2E-WF-13) is verified at API and component level only | FR-004 |
| Two draft-creation guards (the `invoiceId: null` reservation filter and the reserved-count check) are defense in depth: the in-transaction read and MongoDB write-conflict retry already refuse double reservation, so removing either alone fails no test | ADR-0020 Consequences |
| The AI status cache is per API process (30 s) | ADR-0020 §10 |

## Planned MVP limitations (by design)

| Limitation | Reason / reference |
| --- | --- |
| Approvals are recorded by the freelancer, not signed by the client. Evidence strength depends on the recorded note | [ADR-0006](../architecture/adr/0006-versioned-approvals.md), OQ-003 |
| Invoices are drafts with a single tax rate. They are not GST-compliant tax invoices, and users are responsible for compliance | OQ-002 |
| One currency per project and invoice. No conversion | OQ-007, BR-022 |
| Every post-proposal edit requires re-approval, including typos | OQ-008, BR-011 |
| No email or chat sending. Proposals and invoices are shared manually | MVP scope |
| English UI only | OQ-006 |
| No self-service workspace deletion | OQ-005 |
| AI estimates are suggestions. Quality depends on the operator's chosen model, and no model is recommended until evaluated | [AI architecture](../architecture/ai-architecture.md#7-evaluation) |
| Hosted AI endpoints receive project and change-request text when AI is enabled. Their retention is governed by the provider | FR-054, PRV-003 |
| A change request can have at most 50 versions, and an invoice at most 200 lines (bounded embedded arrays) | OQ-014, OQ-015, [data model](../architecture/data-model.md#3-embed-vs-reference-decisions) |
| AI generation details expire after 365 days by default. The "AI-suggested" badge remains | OQ-013 |
| No logo or branding on client-facing proposal and invoice views. They show a text header only | OQ-016 |
