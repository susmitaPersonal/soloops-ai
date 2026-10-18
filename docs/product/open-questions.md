# Open Questions and Working Assumptions

These business decisions could not be inferred safely from the brief. Each has a **working assumption** so work can proceed. A maintainer resolves a question by recording the decision here and updating the affected documents. Material decisions also get an ADR.

| ID | Question | Working assumption | Affects | Status |
| --- | --- | --- | --- | --- |
| OQ-001 | Which open-source license? | **MIT**: simple and familiar to Hacktoberfest contributors. Alternative: AGPL-3.0, which would require hosted modified versions to publish their source. | LICENSE, README | **Resolved 2026-10-18: MIT**, confirmed by the maintainer |
| OQ-002 | Must invoices be GST-compliant tax invoices (GSTIN, place of supply, CGST/SGST/IGST split, HSN/SAC codes)? | **No for MVP.** The MVP produces invoice drafts with a single configurable tax label and rate, and the UI notes that users are responsible for tax compliance. Confirm requirements with users and a qualified adviser before adding compliance claims. | Billing, data model | Open |
| OQ-003 | Do clients interact directly (approval portal) or does the freelancer record their decision? | **The freelancer records** the decision with channel and evidence (FR-025). A signed approval link is a *Could* (FR-031). | Scope Guard, security | Open |
| OQ-004 | Which hosted inference provider and model does the reference deployment use, and who pays? | No default provider. Operators configure their own endpoint, and AI is disabled by default. Pick a model with the [evaluation plan](../architecture/ai-architecture.md#7-evaluation). | AI, deployment | Open |
| OQ-005 | Retention on workspace deletion versus record-keeping obligations for issued invoices. | The MVP offers export but **no self-service workspace deletion**. Define the policy before the first production release (PRV-005). | Data, privacy | Open |
| OQ-006 | Is a Bengali (or Hindi) UI needed for the validation audience? | English only for MVP, i18n-ready (NFR-013). Validate in discovery interviews. | Frontend | Open |
| OQ-007 | Do freelancers need multi-currency (for example USD clients) with INR reporting? | One currency per project and no conversion (BR-022). | Billing | Open |
| OQ-008 | Can trivial edits (typos) after proposal skip re-approval? | **No.** Every content change creates a new version (BR-011). This is simpler and safer for disputes. | Scope Guard | Open |
| OQ-009 | Is a running timer needed or are manual entries enough? | Manual entries only. | Billing | Open |
| OQ-010 | Should there be a public community demo instance? Who hosts it? | Not part of the MVP. Local Docker Compose is the primary distribution. | Deployment | Open |
| OQ-011 | Do the target users actually experience the stated problems strongly enough to adopt a new tool? | Unvalidated. Run the [discovery plan](personas-and-user-journeys.md#discovery-plan). | Product | Open |
| OQ-012 | How should fixed-price milestone billing (for example 40/40/20) work? | Use `FIXED` billable entries linked to baselined requirements. A dedicated milestone feature is post-MVP. | Billing | Open |
| OQ-013 | How long should AI generation records be kept? | **365 days** via a TTL index, configurable. The provenance badge remains after expiry. | Data, privacy | Open |
| OQ-014 | Is 50 versions per change request enough? | **Yes.** Reaching the cap returns `409` with guidance to open a new CR that references the old one. It keeps the embedded array bounded. | Data, Scope Guard | Open |
| OQ-015 | Is 200 lines per invoice enough? | **Yes** for freelancers. Larger billing periods are split into several invoices. | Data, Billing | Open |
| OQ-016 | Should proposal summaries and invoices carry the freelancer's logo or branding? | **Text-only** header from workspace billing details in the MVP. Logo upload is post-MVP because it needs file storage. | UI, Billing | Open |
| OQ-017 | Should dark mode ship in the MVP? | **Yes, as "follow system" plus a manual toggle.** Tokens for both modes are defined and contrast-checked ([design system](../design/ui-ux-design-system.md)). Drop it if it delays M2. | UI | Open |
| OQ-018 | If a Bengali UI is added (OQ-006), which font? | Inter has no Bengali glyphs. Use **Noto Sans Bengali** (OFL) as a fallback in the font stack, and re-verify line heights. | UI | Open |
