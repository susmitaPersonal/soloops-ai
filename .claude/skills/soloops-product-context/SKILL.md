---
name: soloops-product-context
description: SoloOps AI product context — problem, personas, value proposition, MVP scope, terminology, and where the authoritative docs live. Use before answering product questions, when a request may expand scope, when unsure whether something is in the MVP, or when terms like baseline, change request version, decision, eligibility or invoice draft need their exact project meaning.
---

# SoloOps product context

## Purpose
Ground any work in the real product so that features, wording and scope match the documented intent, and so that scope creep inside SoloOps itself is caught.

## When to use
- A request mentions a feature, user or workflow and you need to judge whether it fits the MVP.
- Terminology is ambiguous.
- Someone proposes monetisation, paid tiers, AI auto-actions, or out-of-scope integrations.

## Required inputs
The user's request, and optionally the FR, US or BR IDs it touches.

## Procedure
1. Read [product-overview.md](../../../docs/product/product-overview.md) and [mvp-scope.md](../../../docs/product/mvp-scope.md).
2. Find the matching FR IDs in [requirements.md](../../../docs/product/requirements.md) and check their priority (M/S/C/O).
3. Check [business-rules.md](../../../docs/product/business-rules.md) for constraints, and [open-questions.md](../../../docs/product/open-questions.md) for unresolved decisions and their working assumptions.
4. Classify the request:
   - **In scope** (cite FR/US).
   - **Deferred** (Should/Could; cite).
   - **Out of scope** (cite the exclusion).
   - **New** (not documented → propose it as a requirement, do not silently implement).
5. If the request conflicts with a BR or an exclusion, say so explicitly and suggest the documented alternative.

## Glossary (exact meanings)
| Term | Meaning |
| --- | --- |
| Baseline | A frozen, hashed set of agreed original requirements. The requirements are frozen in place, not copied (BR-004, BR-005) |
| Change request (CR) | A client's extra ask. Owns numbered versions |
| Version | One complete proposal. Editable only in `DRAFT`, frozen on propose |
| Decision | The client's response, recorded by a member, bound to a version and its hash |
| Authorised version | The CR's single `APPROVED` version |
| Eligible entry | A billable entry that may be invoiced per BR-016 |
| Invoice draft / issued | Draft is editable. Issued is immutable and numbered (owner only) |
| Modules | Core Ops, Scope Guard, Billing, Open AI, Community. These are **functional, not pricing tiers** |

## Hard boundaries
- No paid tiers, paywalls or monetisation in the initial release.
- AI never approves, prices or invoices.
- Clients are not system users in the MVP.
- No GST-compliance or estimate-accuracy claims.
- The validation audience (West Bengal freelancers) is a hypothesis, not a fact.

## Output
A short classification with cited IDs, conflicts, and open questions to raise.

## Quality checklist
- [ ] Every claim cites a document or ID.
- [ ] Out-of-scope items are flagged, not quietly accepted.
- [ ] New requirements are proposed with the next free FR ID, never reusing IDs.
