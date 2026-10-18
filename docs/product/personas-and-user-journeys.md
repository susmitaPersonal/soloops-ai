# Personas and User Journeys

> **Status: hypotheses.** These personas come from the project brief and general knowledge of freelance software work. No user interviews have been held yet, so validate them with the [discovery plan](#discovery-plan) before treating them as fact.

## Personas

### P1 — Solo freelance developer ("Riya")

- **Context:** Works alone from Kolkata and builds web and mobile apps for local small businesses and some overseas clients. Requirements arrive over chat apps, calls and occasional emails. Tracks work in spreadsheets and notes.
- **Goals:** Agree scope clearly, get paid for every piece of extra work, and avoid awkward disputes with clients.
- **Pain points:** Says "yes" to small extras that add up to days of unpaid work. Can't later prove what the client approved. Reconstructs invoices from memory.
- **Technical comfort:** High with code, low patience for process tooling.
- **Success looks like:** Every extra request becomes a short, priced proposal the client approves before work starts, and invoicing takes minutes.

### P2 — Small team lead ("Arko")

- **Context:** Runs a 4-person freelance team in Siliguri. Juggles 3–5 concurrent client projects and splits tasks among teammates.
- **Goals:** Know which work is authorised, keep teammates from building unapproved features, and invoice accurately.
- **Pain points:** Teammates act on client chat messages directly. Has no single record of approvals. Billable hours are lost.
- **Success looks like:** Teammates can only pick up tasks that trace to approved scope, and the lead sees unbilled work per project.

### P3 — Team member developer ("Sana")

- **Context:** Developer in P2's team.
- **Goals:** Clear tasks with acceptance criteria and an easy way to log time.
- **Success looks like:** Knows exactly what "done" means and never wonders whether a request was approved.

### P4 — Client (indirect stakeholder)

- **Context:** Small business owner or startup founder. **Does not log into SoloOps AI in the MVP.**
- **Interaction:** Receives a proposal summary (printed, PDF or pasted into chat or email) and replies with a decision. The freelancer records that decision ([OQ-003](open-questions.md)).
- **Needs:** A short, plain-language proposal that states scope, price, timeline impact and assumptions.

### P5 — Self-hoster / contributor ("Dev")

- **Context:** Wants to run SoloOps AI privately or contribute features during Hacktoberfest.
- **Goals:** Set it up in minutes, understand the architecture quickly, and plug in a preferred open-weight model endpoint.

## Permissions summary (MVP)

| Capability | Owner | Member |
| --- | --- | --- |
| Manage workspace settings and members | ✅ | ❌ |
| Manage clients, projects and requirements | ✅ | ✅ |
| Create a scope baseline | ✅ | ✅ |
| Create, edit and propose change requests | ✅ | ✅ |
| Record a client decision | ✅ | ✅ |
| Log billable work | ✅ | ✅ |
| Create and edit invoice drafts | ✅ | ✅ |
| **Issue or void invoices** | ✅ | ❌ |
| Configure AI usage for the workspace | ✅ | ❌ |

The authoritative rules are in [business rules](business-rules.md) and the [security architecture](../architecture/security-architecture.md).

## Primary user journeys

### J1 — Set up and agree original scope (P1/P2)

1. Register (workspace created automatically) → set currency, default hourly rate, tax rate and invoice prefix.
2. Create client → create project (hourly or fixed-price billing).
3. Record requirements with acceptance criteria.
4. **Baseline** the original scope. Requirements become immutable, and later changes must go through change requests.

### J2 — Handle a client's extra request (core journey, P1/P2)

1. The client sends "Can you also add a WhatsApp login?" over chat.
2. The freelancer records a change request and pastes the message as received.
3. (Optional) The freelancer clicks **Analyse with AI** and receives a draft proposal with a clarified description, scope, acceptance criteria, affected requirements, assumptions, an effort range, risks and timeline impact.
4. The freelancer edits the draft, confirms effort and price, and **proposes** version 1, which is then frozen.
5. The freelancer shares the proposal summary with the client.
6. The client replies "Approved" by email. The freelancer **records the decision** (client name, channel, date, evidence note) against version 1.
7. The freelancer **converts** the approved version into tasks.

**Variations:**
- The client asks a question → the decision is *Clarification requested* → the freelancer creates version 2 → proposes → records the decision.
- The client rejects → the work is not authorised, and tasks cannot be created from that version.
- After approval, the client wants more → a new version is required, and the prior approval still covers only the prior version.

### J3 — Deliver and track work (P2/P3)

1. A member picks tasks that trace to baselined requirements or approved change-request versions.
2. They log time or fixed-amount billable entries against those tasks.

### J4 — Invoice (P1/P2)

1. Open **Unbilled work**. Eligible entries are listed, and ineligible entries are shown with a reason (for example "linked change request not approved").
2. Select entries → create an invoice draft. The system computes all amounts.
3. Review and adjust (manual adjustment lines require a reason).
4. The owner **issues** the invoice. It gets a sequential number and becomes immutable, and the printable view is available.

### J5 — Self-host and configure AI (P5)

1. Clone → `docker compose up` → run migrations → open the app.
2. Optionally set `AI_PROVIDER=openai-compatible` with the base URL and model of a hosted or local open-weight endpoint.

## Discovery plan

To validate the West Bengal audience hypothesis before or during Milestone 2:

1. Interview at least 5 freelancers or small-team leads (30 minutes each). Ask how they handle extra requests today, how disputes arise, how they invoice, and which currency or GST constraints apply.
2. Record findings in `docs/product/discovery-notes.md` (to be created). Use anonymised notes only and no personal data.
3. Update personas, open questions and priorities based on the findings.
