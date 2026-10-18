# Product Overview

> This document combines the product overview and the problem statement. They are kept together to avoid two documents that drift apart.

## Product

**SoloOps AI** is an open-source, AI-assisted operations assistant for solo software developers, freelancers and small freelance software teams.

It connects client requirements, additional scope requests, estimates, client approvals, delivery tasks and invoice drafts in **one traceable workflow**:

```text
Client → Project → Requirement → Change Request → Approval → Task → Billable Work → Invoice Draft
```

## Problem statement

Freelance developers and small teams can build software, but many lack structured processes for managing clients, requirements, scope changes, approvals, delivery, documentation and billing. Requirements arrive through calls, chat messages and scattered documents. This leads to:

- Ambiguous requirements and misunderstood expectations.
- Scope creep and unplanned additional work.
- Extra features built without explicit client approval.
- No reliable link between requirements, tasks and delivered work.
- Forgotten billable work and incomplete invoices.
- Disputes about what was originally requested and later approved.
- Inconsistent documentation and delivery processes.

Enterprise project-management tools can be too complex or too expensive for these users.

## Vision

Help independent developers and small freelance teams run projects with the discipline of a professional software organisation, without enterprise complexity or subscription costs.

## Value proposition and differentiator

SoloOps AI is **not primarily a task manager**. Its differentiators are:

1. **Preventing unapproved scope changes.** Extra work becomes authorised only when a client decision is recorded against a specific, frozen proposal version.
2. **Preserving an auditable record of decisions.** It records who decided what, when, through which channel, and on exactly which version.
3. **Reducing forgotten billable work.** Delivered, authorised work is surfaced for invoicing, and unauthorised work is never silently billed.

AI assists by turning vague client requests into clear, reviewable proposals. **AI never decides**: approvals, prices, totals and invoices are controlled by deterministic application logic and human action. See [business rules](business-rules.md).

## Target users

| Segment | Priority |
| --- | --- |
| Solo freelance software developers | Primary |
| Independent software consultants | Primary |
| Small software teams (2–10 people) | Primary |
| Freelance agencies with limited operations staff | Primary |
| Clients of the above | Indirect stakeholder (not a system user in the MVP) |
| Self-hosters and open-source contributors | Secondary |

**Initial validation audience:** freelance developers and small teams in West Bengal, India. This is a **hypothesis to validate**, not an assumption that all users share the same needs. See [personas](personas-and-user-journeys.md) and [MVP success criteria](mvp-scope.md#success-criteria).

## Open-source and zero-cost commitments

- Released under the MIT License, confirmed by the maintainer ([OQ-001](open-questions.md)).
- Free for everyone (₹0). There are no paid tiers, feature packs, paywalls or monetisation features in the initial release.
- It is organised into functional modules. These are **not** pricing tiers:
  1. **Core Ops**: clients, projects, requirements, scope baselines, tasks.
  2. **Scope Guard**: change requests, versioned proposals, estimates, approval records.
  3. **Billing**: billable work and invoice drafts.
  4. **Open AI**: provider adapters for compatible open-weight model endpoints. ("Open AI" in this project means *open AI models*. It is unrelated to the company of a similar name.)
  5. **Community**: templates, integrations, data export and community extensions.
- **Cost transparency.** The application does not require any proprietary paid AI API. Running it may still cost money: a hosted inference endpoint, a server or a managed database may charge fees. The AI features are optional, and the app remains fully usable with AI disabled.

## Related documents

- [Personas and user journeys](personas-and-user-journeys.md)
- [Requirements](requirements.md) · [Business rules](business-rules.md) · [Acceptance criteria](acceptance-criteria.md)
- [MVP scope](mvp-scope.md) · [Roadmap](roadmap.md) · [Open questions](open-questions.md)
- [Solution design](../design/solution-design.md)
