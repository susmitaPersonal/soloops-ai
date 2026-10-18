# Definition of Done

A feature or change is **done** only when **all** applicable items hold. Documentation alone never makes a requirement "implemented".

## Behaviour
- [ ] All acceptance criteria of the linked user stories are met.
- [ ] Business rules (BR-xxx) touched by the change are enforced on the **server**.
- [ ] Input validation (Zod) is in place for every new input.
- [ ] Authorisation is enforced: workspace membership, role, and cross-workspace `404`.
- [ ] Loading, empty, error and success states exist in the UI. `409`/`412`/`401` are handled.
- [ ] Accessibility: keyboard operable, labelled, not colour-only. Axe shows no serious violations on touched screens.

## Quality
- [ ] Tests exist at the right level ([testing strategy](../architecture/testing-strategy.md)), including negative and boundary cases, and they **pass locally and in CI**.
- [ ] New or changed endpoints are added to the cross-workspace isolation suite.
- [ ] `npm run validate` passes (lint, typecheck, tests, build). The PR states the actual commands run and their results.
- [ ] No secrets, real personal data or debug logging of sensitive fields.

## Security
- [ ] Security implications are considered. For auth, tenancy, money or AI changes, a security review is done (skill `soloops-security-review` or the `security-reviewer` agent).

## Documentation
- [ ] Docs reflect the new behaviour: requirements/BR (if rules changed), API design, data model, ADR (if material), and [implementation status](../quality/implementation-status.md).
- [ ] The [traceability matrix](../quality/requirements-traceability.md) is updated with test references.
- [ ] `node scripts/check-docs.mjs` passes.
- [ ] Unresolved limitations are recorded in [known limitations](../quality/known-limitations.md).
