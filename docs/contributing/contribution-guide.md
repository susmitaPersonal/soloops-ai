# Contribution Guide

Thanks for helping build SoloOps AI. It is free and open source. There are no paid tiers, and contributions must not add any.

## Before you start

1. Read the [product overview](../product/product-overview.md) and [business rules](../product/business-rules.md). These rules are non-negotiable invariants.
2. Check [implementation status](../quality/implementation-status.md) and the [roadmap](../product/roadmap.md) for what's next.
3. Find or open an issue ([issue guidelines](issue-guidelines.md)). Comment to claim it. For anything touching approvals, billing, auth or AI, agree on the approach in the issue first.

## Workflow

1. Fork and branch: `feat/<short-name>` (see [coding standards](../engineering/coding-standards.md#git-and-prs)).
2. Set up locally: [local development](../engineering/local-development.md).
3. Make a **small, focused** change: one requirement or a slice of one.
4. Add or update tests, with IDs in test names (`TC-012.3`, `BR-010`).
5. Update the docs that your change makes stale (requirements, API, data model, implementation status, traceability).
6. Run validation and report the **actual** results in your PR.
7. Open a PR using the [PR checklist](pull-request-checklist.md).

## What makes a PR easy to accept

- It links to FR/US/AC IDs.
- It does not mix refactors with features.
- No new dependency without justification. A material one needs an ADR.
- Screenshots or recordings for UI changes, including keyboard-only use.

## Using Claude Code (optional)

The repository includes project skills (`.claude/skills/soloops-*`) and agents (`.claude/agents/*`). [CLAUDE.md](../../CLAUDE.md) explains when to use them. AI-assisted contributions follow the same standards. You are responsible for every line you submit, and claims of passing tests must come from real runs.

## Licensing

By contributing, you agree that your contribution is licensed under the project [license](../../LICENSE).

## Conduct

All participation follows the [code of conduct](code-of-conduct.md).
