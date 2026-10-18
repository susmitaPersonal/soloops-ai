---
name: soloops-feature-development
description: End-to-end procedure for implementing a SoloOps AI feature or fix — requirement check, design, small code slices, tests, docs, self-review and honest reporting. Use whenever writing or changing application code in this repository.
---

# SoloOps feature development

## Purpose
Deliver small, reviewable, fully tested changes that respect the business rules and keep the docs true.

## When to use
Any implementation task: a new endpoint, screen, rule, migration or bug fix.

## Required inputs
The FR, US or AC IDs, or a bug description that references the expected rule.

## Procedure
1. **Locate the requirement.**
   - Find the FR/US/AC IDs. If none exist, stop and use `soloops-product-context` and then `soloops-solution-design`.
   - Read the BRs the change touches.
2. **Check status.** Read [implementation-status.md](../../../docs/quality/implementation-status.md) to avoid duplicating work. Inspect the existing code before writing new code.
3. **Plan a thin slice.** Aim for one AC or a few closely related ACs, under about 400 changed lines. Identify:
   - modules, endpoints, tables and screens touched
   - transactions and locks needed
   - test levels needed
   If architecture is affected, apply `soloops-architecture`.
4. **Write tests first where practical.** Name tests with IDs (`TC-012.3`, `BR-010`). Include negative and boundary cases (`soloops-testing`).
5. **Implement**, following [coding-standards.md](../../../docs/engineering/coding-standards.md):
   - Zod validation
   - `requireMembership` and role checks
   - `workspaceId`-scoped repositories
   - typed domain errors
   - audit events in the transaction
   - integer money
   - UI with loading, empty, error and success states, accessible
6. **AI-related?** Apply `soloops-ai-engineering`.
7. **Security-relevant?** If it touches auth, tenancy, money, approvals, AI data flow or dependencies, apply `soloops-security-review`.
8. **Run validation** (after M1): `npm run validate`, plus `npm run test:e2e` for flow changes, plus `node scripts/check-docs.mjs`. Fix failures. Do not weaken tests to make them pass.
9. **Update docs** with `soloops-documentation`. That includes traceability rows, implementation status, the API and data model, and known limitations.
10. **Report honestly:**
    - what changed
    - the commands actually run and their actual results
    - what was not run and why
    - remaining limitations

## Output
- Code and tests.
- Updated docs.
- A PR description following [pull-request-checklist.md](../../../docs/contributing/pull-request-checklist.md).

## Quality checklist (Definition of Done)
- [ ] ACs met. BRs enforced server-side.
- [ ] Validation, authorisation, cross-workspace 404, and the isolation matrix updated.
- [ ] Tests exist and **actually pass**. Results are quoted, not assumed.
- [ ] UI states and accessibility are handled.
- [ ] Docs, traceability and status are updated. The docs check passes.
- [ ] No secrets or real personal data.
