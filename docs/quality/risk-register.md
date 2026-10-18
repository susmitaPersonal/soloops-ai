# Risk Register

Likelihood and impact: L (low), M (medium), H (high). Review at each milestone.

| ID | Risk | L | I | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| R-01 | Target users don't feel the pain strongly enough to switch from chat apps and spreadsheets (OQ-011) | M | H | Discovery interviews before M5. SC-4/SC-5 usability sessions. Keep the workflow fast | Maintainers |
| R-02 | MVP scope too large for community capacity | H | M | MoSCoW, small milestones, Should/Could items deferrable | Maintainers |
| R-03 | Cross-workspace data leak through a missed `workspaceId` filter | M | H | `TenantCollection` wrapper, lint rule restricting `mongodb` imports, TC-SEC-01/02 matrix, security review | All contributors |
| R-04 | AI suggestions are wrong or hallucinate scope, and users over-trust them | M | M | Mandatory human review, provenance badges, disclaimer, evaluation before recommending a model | AI contributors |
| R-05 | Hosted inference cost or provider terms change | M | M | Provider abstraction, AI optional, self-hosting path | Operators |
| R-06 | Client data sent to third-party AI providers without informed consent | M | H | Opt-in with disclosure (FR-054), minimisation (SEC-008) | Maintainers |
| R-07 | Users treat invoice drafts as legally compliant tax invoices | M | H | Clear disclaimer. OQ-002 resolution before any compliance claim | Maintainers |
| R-08 | Approval evidence is disputed (freelancer-recorded, not client-signed) | M | M | Capture channel, evidence and hash. FR-031 signed link later. Documented limitation | Product |
| R-09 | Money bugs (rounding, float use) | L | H | Integer minor units, pure functions, property tests | Billing contributors |
| R-10 | Documentation drifts from implementation | H | M | Definition of done requires doc updates. `documentation-reviewer` agent. Docs check script | All contributors |
| R-11 | Vulnerable or malicious dependency | M | H | Lockfile, audit in CI, minimal deps, pinned actions | Maintainers |
| R-12 | Maintainer bandwidth after Hacktoberfest | M | M | Good onboarding docs and a modular structure that eases hand-over | Maintainers |
| R-13 | No database-enforced foreign keys or row locks in MongoDB, so integrity relies on services, conditional updates and transactions | M | M | Invariant table in ADR-0012, integration tests for every guard and race, replica set required everywhere | Backend contributors |
| R-14 | Next.js caches per-user data and serves it to another user | L | H | `no-store`/dynamic rendering rule, code review checklist, E2E test with two users | Web contributors |
