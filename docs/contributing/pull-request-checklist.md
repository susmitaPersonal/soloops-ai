# Pull Request Checklist

Copy this into your PR description. (A GitHub PR template is added in M1.)

```markdown
## What and why
<!-- Short description. Link issue and requirement IDs: Closes #…, FR-…, US-…, AC-… -->

## How it was tested
<!-- Exact commands you ran and their actual results. Do not claim runs you didn't do. -->
- [ ] `npm run validate` → result:
- [ ] `npm run test:e2e` (if UI/flow changed) → result:
- [ ] `node scripts/check-docs.mjs` → result:

## Checklist
- [ ] Small and focused. No unrelated refactors
- [ ] Business rules enforced server-side. BR IDs referenced in code and tests
- [ ] Input validated (Zod). Authorisation checked (membership, role, cross-workspace 404)
- [ ] New tenant endpoints added to the isolation test matrix (TC-SEC-01/02)
- [ ] Money uses integer minor units and shared money functions only
- [ ] AI changes: prompt/schema version bumped, output validated, no state-changing path
- [ ] UI: loading, empty and error states. Keyboard accessible. No colour-only status
- [ ] Docs updated (requirements, API, data model, ADR if material, implementation status, traceability)
- [ ] No secrets, real personal data or sensitive logging
- [ ] Known limitations recorded if anything is left unresolved
```
