# UI/UX Design System

> **Status:** Proposed. No UI exists yet. Colour contrast values in this document were **computed** with `node scripts/check-contrast.mjs` (90 token pairs, 0 failures on 2026-10-16). That checks colour math only. Rendered screens have **not** been audited for accessibility; that happens in M2+ with axe and manual keyboard checks (A11Y-007). Screens are specified in [screen specifications](screen-specifications.md). The frontend structure is in [frontend architecture](../architecture/frontend-architecture.md).

## 1. Design principles

SoloOps AI should feel like a **calm, precise ledger**: trustworthy enough for money and approvals, light enough for a solo developer to use between coding sessions.

1. **Status first.** The first thing on any CR, task or invoice is its state: what is agreed, what is pending, what is authorised. Status is always text plus an icon, never colour alone (A11Y-004).
2. **Scope is visible.** Original scope (baseline), additional scope (change requests) and authorised work have distinct, consistent visual tags everywhere.
3. **Money shows its working.** Every amount can be traced to minutes × rate or a fixed amount. Numbers use tabular figures and right alignment.
4. **AI is clearly advisory.** AI content lives in a violet-accented panel, labelled "AI suggestion". It is never mixed silently into authoritative data and never on a primary action colour.
5. **Deliberate commitments.** Actions that freeze, decide or bill use a confirmation dialog that summarises the consequence. Everything else stays one click.
6. **Quiet by default.** Neutral surfaces, one primary colour, generous whitespace, no decorative gradients or illustrations in working screens.
7. **Explain why not.** Disabled actions and ineligible items always state the reason and the next step.

## 2. Colour

### 2.1 Reasoning

| Role | Choice | Why |
| --- | --- | --- |
| Primary | Blue `#2550C7` | Blue is the conventional colour of trust in finance and productivity tools. This shade is slightly desaturated so it reads "professional" rather than "consumer". It passes 6.88:1 with white text, so buttons are comfortable to read |
| Neutrals | Cool slate greys | They recede behind content and pair cleanly with blue. Text greys were tuned so even the subtlest text passes 4.5:1 on every surface |
| AI accent | Violet `#5B21B6` / `#F5F3FF` | It doesn't collide with any semantic state, so AI content is never mistaken for success, warning or primary actions |
| Additional scope | Teal `#115E59` / `#CCFBF1` | Distinct from blue (primary) and green (authorised). Teal reads "new, extra" without implying good or bad |
| Pending approval | Amber `#854D0E` / `#FEF3C7` | Universally read as "waiting", distinct from warning orange |
| Warning | Orange `#9A3412` / `#FFEDD5` | Needs attention but isn't an error. A different hue from pending, so the two are never confused |
| Success / authorised | Green `#166534` / `#DCFCE7` | Approved, authorised, issued |
| Error / danger | Red `#991B1B` / `#FEE2E2`, solid `#B91C1C` | Errors, destructive actions, rejected |
| Info | Blue `#1E40AF` / `#DBEAFE` | Neutral information and the "proposed" state |

Hue alone is never relied on. Each semantic state also has an icon and a text label.

### 2.2 Colour tokens

CSS custom properties, prefix `--so-`. Light is the default, and dark applies via `[data-theme="dark"]` or `prefers-color-scheme: dark` (see §2.4).

| Token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `--so-bg` | `#F7F8FA` | `#0F1115` | Page background |
| `--so-surface` | `#FFFFFF` | `#171A21` | Cards, tables, dialogs, inputs |
| `--so-surface-muted` | `#F1F3F6` | `#1F232C` | Table headers, read-only fields, hover rows |
| `--so-border` | `#D5DAE1` | `#2C313C` | **Decorative** dividers only (not control boundaries) |
| `--so-border-strong` | `#7A8496` | `#6B7385` | Input, checkbox and secondary-button borders (≥ 3:1) |
| `--so-text` | `#111827` | `#E6E8EC` | Primary text |
| `--so-text-muted` | `#4B5563` | `#A7AFBD` | Secondary text, labels |
| `--so-text-subtle` | `#636A77` | `#8E97A8` | Hints, timestamps, placeholders (still ≥ 4.5:1) |
| `--so-primary` | `#2550C7` | `#7EA6FF` | Primary buttons, links (light), selected states |
| `--so-primary-hover` | `#1D3FA3` | `#A3C0FF` | Hover and active of primary |
| `--so-on-primary` | `#FFFFFF` | `#0B1220` | Text on primary buttons |
| `--so-link` | `#2550C7` | `#8DB0FF` | Inline links |
| `--so-primary-subtle` | `#E8EEFC` | `#1B2440` | Selected nav item, selected row |
| `--so-on-primary-subtle` | `#1D3FA3` | `#B5CBFF` | Text on primary-subtle |
| `--so-secondary-text` | `#334155` | `#E6E8EC` | Secondary button text |
| `--so-focus` | `#2550C7` | `#8DB0FF` | Focus ring |
| `--so-danger` | `#B91C1C` | `#C93030` | Destructive buttons (text `#FFFFFF` in both modes) |
| `--so-danger-hover` | `#991B1B` | `#B02626` | Hover of destructive buttons |
| `--so-ai-fg` / `--so-ai-bg` / `--so-ai-border` | `#5B21B6` / `#F5F3FF` / `#7C5CD6` | `#C4B5FD` / `#231A3D` / `#8B6FE0` | AI suggestion panel and badge |
| `--so-success-fg` / `-bg` / `-icon` | `#166534` / `#DCFCE7` / `#15803D` | `#86EFAC` / `#0F2A1A` / `#86EFAC` | Approved, authorised, issued, eligible |
| `--so-pending-fg` / `-bg` / `-icon` | `#854D0E` / `#FEF3C7` / `#B45309` | `#FCD34D` / `#2E2306` / `#FCD34D` | Awaiting client decision |
| `--so-warning-fg` / `-bg` | `#9A3412` / `#FFEDD5` | `#FDBA74` / `#33190A` | Needs revision, ineligible, stale data |
| `--so-error-fg` / `-bg` | `#991B1B` / `#FEE2E2` | `#FCA5A5` / `#3A1212` | Errors, rejected, void |
| `--so-info-fg` / `-bg` | `#1E40AF` / `#DBEAFE` | `#93C5FD` / `#0F1F3D` | Proposed (frozen), informational notes |
| `--so-neutral-fg` / `-bg` | `#374151` / `#F1F3F6` | `#D1D5DB` / `#252A33` | Draft, withdrawn, superseded, internal |
| `--so-scope-baseline-fg` / `-bg` | `#334155` / `#E2E8F0` | `#CBD5E1` / `#252A33` | "Original scope" tag |
| `--so-scope-additional-fg` / `-bg` | `#115E59` / `#CCFBF1` | `#5EEAD4` / `#0B2A27` | "Additional scope" tag |

Any token change must update `scripts/check-contrast.mjs` in the same PR.

### 2.3 Verified contrast (selected pairs)

Computed with the WCAG 2.x relative-luminance formula. Requirements: 4.5:1 for normal text, 3:1 for non-text UI and large text. The full list is printed by `node scripts/check-contrast.mjs`.

| Pair | Light | Dark |
| --- | --- | --- |
| Text on background | 16.69:1 | 15.40:1 |
| Text on surface | 17.74:1 | 14.19:1 |
| Muted text on surface | 7.56:1 | 7.88:1 |
| Subtle text on surface-muted (worst case) | 4.90:1 | 5.35:1 |
| On-primary text on primary button | 6.88:1 | 7.83:1 |
| Primary/link text on surface | 6.88:1 | 8.11:1 |
| Selected nav text on primary-subtle | 7.88:1 | 9.43:1 |
| White text on danger button | 6.47:1 | 5.32:1 |
| AI text on AI background | 8.19:1 | 8.84:1 |
| Success / pending / warning / error / info badge text on own background | 6.49 / 6.15 / 6.38 / 6.80 / 7.15 | 10.95 / 10.72 / 9.70 / 8.68 / 9.07 |
| Baseline / additional scope tag | 8.40 / 6.73 | 9.70 / 10.33 |
| Strong border on surface (non-text, ≥ 3:1) | 3.77:1 | 3.66:1 |
| Strong border on surface-muted (worst case) | 3.39:1 | 3.31:1 |
| Focus ring on background | 6.48:1 | 8.81:1 |
| AI panel border on surface | 4.82:1 | 4.52:1 |

The decorative `--so-border` (`#D5DAE1`) is **intentionally below 3:1** and must never be the only boundary of an interactive control.

### 2.4 Light and dark mode

- The tokens are the only colour source. Components never use raw hex values. Lint is configured with `stylelint` (`color-no-hex` outside the tokens file) in M2.
- Default is **follow system** (`prefers-color-scheme`). A manual toggle (System / Light / Dark) in the user menu stores the preference in `localStorage` and sets `data-theme` on `<html>` before paint (inline script) to avoid a flash.
- Dark mode uses lighter surfaces for elevation instead of shadows, borders slightly stronger, and saturated colours lightened so they keep contrast without glowing.
- Print views (proposal summary, invoice) **always use light tokens**.
- Whether dark mode ships in the MVP is [OQ-017](../product/open-questions.md).

```css
:root {
  --so-bg: #F7F8FA; --so-surface: #FFFFFF; --so-text: #111827; --so-primary: #2550C7; /* … */
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --so-bg: #0F1115; --so-surface: #171A21; --so-text: #E6E8EC; --so-primary: #7EA6FF; /* … */ }
}
:root[data-theme="dark"] { --so-bg: #0F1115; --so-surface: #171A21; --so-text: #E6E8EC; --so-primary: #7EA6FF; /* … */ }
```

## 3. Typography

- **UI font:** Inter (SIL Open Font License), loaded with `next/font`. It is self-hosted at build time, so there are no runtime requests to third parties. Fallback: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Bengali fallback: [OQ-018](../product/open-questions.md).
- **Mono:** `ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace` for content hashes, IDs and keys (`CR-3`, `REQ-2`). There is no extra web font.
- **Numbers:** `font-variant-numeric: tabular-nums` for all amounts, durations and tables.

| Token | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| `--so-text-xs` | 12 / 16 px | 500 | Badges, table meta, timestamps |
| `--so-text-sm` | 14 / 20 px | 400–500 | Default UI text, tables, form inputs |
| `--so-text-md` | 16 / 24 px | 400 | Body copy, dialogs, long descriptions |
| `--so-text-lg` | 18 / 28 px | 600 | Card titles, section headings |
| `--so-text-xl` | 20 / 28 px | 600 | Page sub-headings |
| `--so-text-2xl` | 24 / 32 px | 600 | Page titles |
| `--so-text-3xl` | 30 / 36 px | 700 | Dashboard key figures, invoice total |

Rules:
- Minimum 14 px for interactive text. 12 px only for non-essential meta.
- Body line length ≤ 75 characters.
- Sentence case everywhere. No all-caps except 12 px badge labels with +0.02em tracking.

## 4. Spacing, layout, radii, elevation

**Spacing scale (4 px base):** `--so-space-0` 0 · `1` 4 · `2` 8 · `3` 12 · `4` 16 · `5` 20 · `6` 24 · `8` 32 · `10` 40 · `12` 48 · `16` 64 px.
Form field gap 16. Card padding 20 (mobile 16). Section gap 32. Page gutter 24 (mobile 16).

**Radii:** `--so-radius-sm` 4 px (badges, tags) · `md` 6 px (buttons, inputs) · `lg` 8 px (cards, tables) · `xl` 12 px (dialogs, panels) · `full` 9999 px (avatars, pills).

**Elevation:** shadows in light mode only. Dark mode uses a surface step plus a border instead.

| Token | Light value | Use |
| --- | --- | --- |
| `--so-shadow-sm` | `0 1px 2px rgba(17,24,39,0.06)` | Cards |
| `--so-shadow-md` | `0 4px 12px rgba(17,24,39,0.08)` | Dropdowns, popovers, sticky headers |
| `--so-shadow-lg` | `0 12px 32px rgba(17,24,39,0.16)` | Dialogs, drawers |

**Breakpoints:** `sm` 600 px (tables → cards) · `md` 768 px (side panels stack) · `lg` 1024 px (persistent sidebar) · `xl` 1280 px (max content width 1200 px).

**Motion:** 120 ms (hover, press) and 200 ms (panels, dialogs), `cubic-bezier(0.2, 0, 0, 1)`. With `prefers-reduced-motion`, transitions become instant except opacity.

**Z-index:** sticky header 10 · dropdown 20 · drawer 30 · dialog 40 · toast 50.

## 5. Icons

- **Lucide** (ISC license), tree-shaken React components.
- Sizes 16 px (inline, badges, buttons) and 20 px (navigation, empty states). Stroke 1.75. Colour `currentColor`.
- Icons are decorative (`aria-hidden="true"`) when a text label is present. Icon-only buttons require an `aria-label` and a tooltip.
- Fixed meanings (never reuse an icon for another meaning):

| Meaning | Icon |
| --- | --- |
| Draft | `PencilLine` |
| Proposed (frozen) | `Lock` |
| Awaiting decision | `Hourglass` |
| Approved / authorised | `CircleCheck` |
| Rejected | `CircleX` |
| Needs revision | `MessageCircleQuestion` |
| Withdrawn / superseded | `Archive` / `History` |
| AI suggestion | `Sparkles` |
| Original scope | `Layers` |
| Additional scope | `PlusSquare` |
| Ineligible | `Ban` |
| Invoice | `ReceiptText` |
| Audit history | `ScrollText` |
| Content hash | `Fingerprint` |

## 6. Status mapping

The single source for how states look. `StatusBadge` takes the domain enum and renders the mapped tone, icon and label.

| Domain | State | Tone | Label |
| --- | --- | --- | --- |
| CR version | `DRAFT` | neutral | Draft |
| | `PROPOSED` | info | Proposed · awaiting client |
| | `APPROVED` | success | Approved |
| | `REJECTED` | error | Rejected |
| | `CLARIFICATION_REQUESTED` | warning | Client asked for changes |
| | `WITHDRAWN` | neutral | Withdrawn |
| | `SUPERSEDED` | neutral | Superseded by vN |
| CR (derived) | `DRAFT` / `REVISING` | neutral | Draft / Revising (vN still approved) |
| | `AWAITING_DECISION` | **pending** | Awaiting client decision |
| | `NEEDS_REVISION` | warning | Needs revision |
| | `APPROVED` | success | Approved |
| | `REJECTED` / `WITHDRAWN` | error / neutral | Rejected / Withdrawn |
| Authorisation (work) | authorised | success | Authorised |
| | not authorised | pending or warning | Not authorised: awaiting decision / rejected |
| Scope tag | baseline | scope-baseline | Original scope · REQ-n |
| | change request | scope-additional | Additional · CR-n vN |
| | internal | neutral | Internal (not billable) |
| Task | `TODO` / `IN_PROGRESS` / `DONE` | neutral / info / success | To do / In progress / Done |
| Entry eligibility | eligible / ineligible | success / warning | Ready to invoice / Not billable: reason |
| Invoice | `DRAFT` / `ISSUED` / `VOID` | neutral / success / error | Draft / Issued / Void |
| AI generation | suggestion | ai | AI suggestion |

## 7. Components

Each component lists its anatomy, variants, states, keyboard behaviour and responsive behaviour. All interactive components share these rules:
- **Visible focus:** a 2 px `--so-focus` outline with 2 px offset, shown on `:focus-visible`.
- **Hit target:** ≥ 40 × 40 px (≥ 44 px on touch layouts).
- **Disabled:** 50% opacity plus `aria-disabled`. Where the reason isn't obvious, a tooltip or helper text explains why.

### 7.1 Buttons

| Variant | Look | Use |
| --- | --- | --- |
| Primary | `--so-primary` fill, `--so-on-primary` text | The single main action per view (for example "Propose to client") |
| Secondary | Surface fill, `--so-border-strong` border, `--so-secondary-text` | Alternative actions |
| Ghost | No border, primary text, subtle hover | Tertiary actions, toolbar actions |
| Danger | `--so-danger` fill, white text | Void, delete draft, reject (in confirmation only) |
| AI | AI-subtle fill, `--so-ai-fg` text, `Sparkles` icon | "Analyse with AI" only. Never used for authoritative actions |

- **Sizes:** `sm` 32 px high, `md` 40 px (default), `lg` 48 px (mobile primary).
- **Loading:** a spinner replaces the leading icon, the label stays, `aria-busy="true"`, and the button is disabled to prevent double submit. Idempotency keys cover retries.
- **Keyboard:** `Enter` and `Space` activate it. Icon-only buttons need an `aria-label`.

### 7.2 Form controls

TextField, TextArea, Select (Radix), DateField (native `type="date"`, value `YYYY-MM-DD`), **MoneyInput**, **DurationInput**, Checkbox, RadioGroup.

- **Anatomy:** label (always visible, not a placeholder), optional hint, control, error message (`aria-describedby`), and a character counter for limited text.
- **States:**
  - default: `--so-border-strong`
  - hover
  - focus: focus ring
  - invalid: `--so-error-fg` border, error icon and message
  - disabled
  - read-only: `--so-surface-muted`, no border
- **MoneyInput:** shows the currency symbol prefix. The user types a decimal; it is converted to a minor-unit string, and the input refuses more decimals than the currency allows. It is right-aligned with tabular numbers. **It only collects an input. Displayed prices always come from the server.**
- **DurationInput:** accepts `1h 30m`, `1.5h` or `90m`, normalises to minutes, and shows "= 1 h 30 min" as a hint.
- **Validation timing:** on submit, then live while the user corrects a field (re-validation on change). On submit, an **ErrorSummary** box at the top lists links to each invalid field and receives focus (A11Y-003). Server `422` errors map to the same fields. *(Changed in M3: validating on blur inserted error text above the submit button as focus left the field, so the button moved under the pointer and the click that caused the blur was lost.)*
- **Required fields** are marked "(required)" in text, not only with an asterisk.

### 7.3 Navigation

- **App shell:** a 240 px sidebar on `lg+`. On smaller screens, a top bar with a menu button opens the sidebar as a drawer (focus-trapped, `Esc` closes).
- **Sidebar sections** (see [information architecture](screen-specifications.md#1-information-architecture)): workspace switcher, Dashboard, Approvals (with a count badge), Clients, Projects, Billing, then Settings at the bottom. The current item uses `--so-primary-subtle` with `aria-current="page"`.
- **Project tabs** inside a project: Overview · Requirements · Change requests · Tasks · Billing. Implemented as links (not ARIA tabs) because each is a route. On narrow screens they scroll horizontally with visible overflow cues.
- **Skip link:** "Skip to main content" is the first focusable element.

### 7.4 Page header

Breadcrumbs (`Projects / Online ordering app / CR-3`), title, StatusBadge, key meta (client, dates), and right-aligned actions (one primary, others in an overflow menu below `md`). A sticky variant applies on long detail pages.

### 7.5 Cards and stat tiles

- **Card:** surface, `--so-radius-lg`, 1 px `--so-border`, `--so-shadow-sm`, 20 px padding. It has an optional header (title plus action) and footer.
- **StatTile (dashboard):** label (`text-sm` muted), value (`text-3xl` tabular), optional context line ("across 3 projects"), and a link to the underlying list. No sparkline in the MVP.

### 7.6 Tables (DataTable)

- Semantic `<table>`, with `<th scope>` headers, a header row in `--so-surface-muted`, and row hover. Numeric columns are right-aligned with tabular numbers.
- Sorting only where the API supports it (MVP: none, server order). "Load more" button for cursor pagination (no page numbers).
- **Responsive:** below 600 px each row becomes a card, with the header labels shown inline (`dl`).
- **States:** skeleton rows (loading), EmptyState, ErrorState with retry and request ID.
- **Row actions:** an overflow menu (Radix DropdownMenu, arrow-key navigation).

### 7.7 Badges and status indicators

- **StatusBadge:** pill, `--so-radius-full`, 12 px medium label, 16 px icon, tone from §6. The text is always present.
- **ScopeTag:** square-ish (`--so-radius-sm`), with a monospace key (`REQ-2`, `CR-3 v2`) that links to the source.
- **Count badge** (nav): neutral or pending tone, with a hidden full label for screen readers ("3 change requests awaiting decision").

### 7.8 Dialogs and confirmation flows

Radix Dialog: focus trap, initial focus on the first field (or the least destructive button), and focus restored on close. `Esc` closes it unless a submit is in progress.

| Consequence level | Actions | Confirmation pattern |
| --- | --- | --- |
| **L1 Reversible** | Edit draft, create task, log time, apply AI field | None. Toast plus undo where cheap |
| **L2 Freezing** | Create baseline, propose version, withdraw | Dialog summarising what will be frozen, with a primary confirm |
| **L3 Evidence** | Record client decision | Dialog with the required decision fields, the read-only line "Recording on vN · hash 3f9a…", and an explicit checkbox "I confirm the client made this decision" |
| **L4 Financial / irreversible** | Issue invoice, void invoice | Dialog showing number to assign, total and consequences, plus a checkbox acknowledgement. Danger styling for void, which also requires a reason |

Confirm buttons state the action ("Issue invoice RS-0008"), never "OK".

### 7.9 Change-request comparison (VersionCompare)

- Two-column view (stacked on mobile): `vN-1` on the left, `vN` on the right. A selector picks any two versions.
- **Field-level diff:** list items are marked added (`+`, success tone, underline) or removed (`−`, error tone, strikethrough). Changed scalars show "old → new". The text markers make it colour-independent.
- Price and effort changes are shown as a summary row at the top ("Price ₹12,000 → ₹13,500 · +₹1,500").
- Accessible: each change is listed in reading order with "Added:", "Removed:" or "Changed:" prefixes for screen readers.

### 7.10 Approval timeline and audit history

- **ApprovalTimeline (per CR):** a vertical list (`<ol>`), oldest first. Each item has an icon in the state tone, a title ("v2 approved by S. Das via Email"), the date, the recorder, the evidence note (expandable) and the short hash with a copy button.
- **AuditHistory (per entity and workspace):** a compact table with time, actor, action label (from the contract enum) and details. It is read-only and uses "Load more" pagination.

### 7.11 AI suggestion panel

- **Container:** `--so-ai-bg` background, 1 px `--so-ai-border`, `--so-radius-xl`, and a header "AI suggestion · not yet applied" with the `Sparkles` icon and model/prompt version meta (`text-xs` subtle).
- **Body:** each field (description, scope, acceptance criteria, assumptions, risks, questions, effort range) is shown with an **Apply** ghost button. "Apply all" sits in the header. Applied fields show a check and "Applied". In the draft form they show an `AI-suggested` badge until edited.
- **Effort:** "6–8–14 h (low–likely–high)". The indicative cost range is labelled "Indicative, computed by SoloOps from your rate", plus the BR-026 estimate disclaimer. There is **no** "approve" or "propose" action inside the panel.
- **Warnings:** dropped unknown requirement keys and truncated input appear as an inline warning alert.
- **States:**
  - idle: an "Analyse with AI" AI button
  - running: progress text, elapsed time and a **Cancel** button, with `aria-live` "Analysing…"
  - success: `aria-live` "AI suggestion ready"
  - failure: a warning alert "AI analysis unavailable — you can write the proposal manually", with Retry
  - disabled: the panel is hidden, or for owners a link "Enable AI in Settings"

### 7.12 Invoice summary and line items

- **InvoiceLineRow:** source ScopeTag, description, quantity (`2 h 00 min` or `—`), rate, and amount (right-aligned). Adjustment lines show a "Manual" badge and the reason.
- **MoneyBreakdown:** Subtotal / Tax (label and rate) / **Total** (`text-xl` semibold), right-aligned, with tabular numbers. Each value comes from the server.
- **Draft watermark:** a diagonal "DRAFT" in `--so-text-subtle` at 10% opacity on screen and print.
- **Disclaimer footer:** "SoloOps AI does not verify tax compliance. Review before sending." ([OQ-002](../product/open-questions.md))

### 7.13 Notifications and errors

| Component | Use | Behaviour |
| --- | --- | --- |
| **Toast** | Success of L1/L2 actions ("Task created") | `role="status"`, auto-dismiss after 5 s (paused on hover or focus), max 3 stacked, never the only place an error appears |
| **InlineAlert** | Section-level info, warning or error | `role="alert"` only for errors, with an optional action |
| **Banner** | Page-level conditions: `409`/`412` conflict ("This change request changed. Reload"), AI disabled, archived project (read-only) | Persistent until resolved |
| **ErrorSummary** | Form submit errors | Receives focus and links to fields |
| **ErrorState** | Failed page or section load | Message, Retry and request ID ("Reference: 01JA…") |
| **PermissionNotice** | `403` or owner-only action seen by a member | "Only workspace owners can issue invoices. Ask an owner to review this draft." No dead-end disabled buttons without explanation |
| **EmptyState** | No data yet | Icon, one-line explanation, and the primary next action |
| **Skeleton** | Loading | Matches the final layout shape, `aria-busy` on the region |

## 8. Content guidelines

- **Plain language:** "Client approved v2", not "Approval record created".
- **Money:** `₹13,500.00` (`en-IN` grouping, currency from the data). Never abbreviate in invoices.
- **Dates:** `14 Oct 2026` in UI, ISO in exports. Relative time ("3 days waiting") only together with an absolute date tooltip.
- **AI wording:** always "suggestion", never "decision" or "approved by AI".
- **Estimate disclaimer (BR-026):** "This is an estimate based on the listed assumptions, not a guarantee of actual effort."

## 9. Accessibility checklist (per component and screen)

- [ ] Keyboard: everything reachable and operable, logical order, no traps except dialogs, `Esc` closes overlays.
- [ ] Focus visible (2 px ring) and restored after dialogs and drawers.
- [ ] Labels and descriptions programmatically associated, and errors announced.
- [ ] Status never colour-only (text plus icon).
- [ ] Contrast: tokens only (verified by the script). New colours are added to the script first.
- [ ] `aria-live` for async results (AI ready, invoice issued, save failed).
- [ ] Zoom to 200% and a width of 320 CSS px without loss of content (reflow).
- [ ] Reduced motion respected.
- [ ] Automated axe checks plus manual screen-reader smoke tests (NVDA on Windows, VoiceOver on macOS) per release. **Not yet performed.**
