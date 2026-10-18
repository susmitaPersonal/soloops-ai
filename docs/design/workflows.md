# Workflows and User Flows

Part A shows **system workflows**: how data and services interact. Part B shows **user flows**: what a person does, screen by screen. State rules live in [change-request-lifecycle.md](change-request-lifecycle.md), business rules in [business-rules.md](../product/business-rules.md), and screens in [screen-specifications.md](screen-specifications.md).

# Part A — System workflows

## 1. End-to-end traceability

```mermaid
flowchart LR
    C[Client] --> P[Project]
    P --> R[Requirements]
    R --> B[Scope baseline]
    P --> CR[Change request]
    CR --> V[Versions v1..n]
    V --> A[Approval record]
    B --> T[Tasks]
    A -->|APPROVED only| T
    T --> E[Billable entries]
    B -.direct link.-> E
    A -.direct link.-> E
    E -->|eligible only| I[Invoice draft]
    I -->|owner issues| II[Issued invoice]
```

## 2. Change request → approval (with optional AI)

```mermaid
sequenceDiagram
    actor F as Freelancer
    participant UI as Web app
    participant API as API (scope-guard)
    participant AI as AI module
    participant M as Model endpoint
    actor CL as Client (outside system)

    F->>UI: Record CR (raw text as received)
    UI->>API: POST change-requests
    API-->>UI: CR + draft v1
    opt AI enabled for workspace
        F->>UI: Analyse with AI
        UI->>API: POST versions/1/analyze (Idempotency-Key)
        API->>AI: analyzeChangeRequest(context)
        AI->>M: chat completion (structured output)
        M-->>AI: JSON
        AI->>AI: validate (Zod), drop unknown requirement keys
        AI-->>API: suggestion + generation metadata
        API-->>UI: suggestion (draft NOT modified)
        F->>UI: Review, apply fields, edit
        UI->>API: PATCH versions/1 (If-Match)
    end
    F->>UI: Confirm effort/price, Propose
    UI->>API: POST versions/1/propose
    API->>API: completeness check, compute price, hash, freeze, audit
    API-->>UI: PROPOSED v1 (hash)
    F->>CL: Share proposal summary (print/copy)
    CL-->>F: "Approved" (email/chat/call)
    F->>UI: Record decision (name, date, channel, evidence)
    UI->>API: POST versions/1/decisions {decision, contentHash}
    API->>API: lock version, check PROPOSED + hash, insert approval, supersede old, audit
    API-->>UI: APPROVED
    F->>UI: Convert to tasks
    UI->>API: POST versions/1/tasks
```

## 3. Billable work → invoice

```mermaid
sequenceDiagram
    actor F as Freelancer / Member
    actor O as Owner
    participant API as API (billing)
    participant EL as Eligibility service

    F->>API: POST billable-entries (task / requirement / CR version link)
    F->>API: GET billable-entries?state=unbilled
    API->>EL: classify(entries)
    EL-->>API: eligible[] / ineligible[] with reasons
    F->>API: POST invoices {entryIds}
    API->>EL: re-check all eligible (BR-017)
    API->>API: compute lines, subtotal, tax, total (BR-020)
    API-->>F: DRAFT invoice
    O->>API: POST invoices/{id}/issue (Idempotency-Key)
    API->>EL: re-check every line
    API->>API: lock workspace counter, assign number, freeze, mark entries billed, audit
    API-->>O: ISSUED invoice
```

## 4. Eligibility decision

```mermaid
flowchart TD
    S[Billable entry] --> L{Linked source? via task or direct}
    L -->|none| X1[INELIGIBLE: UNSCOPED]
    L -->|requirement| RB{Requirement baselined?}
    RB -->|no| X2[INELIGIBLE: REQUIREMENT_NOT_BASELINED]
    RB -->|yes| INV
    L -->|CR version| VS{Version APPROVED or SUPERSEDED?}
    VS -->|no| X3[INELIGIBLE: CR_NOT_APPROVED]
    VS -->|yes| INV
    INV{On a non-void invoice?} -->|yes| X4[INELIGIBLE: ALREADY_INVOICED]
    INV -->|no| CUR{Currency = project currency?}
    CUR -->|no| X5[INELIGIBLE: CURRENCY_MISMATCH]
    CUR -->|yes| OK[ELIGIBLE]
```

Reason codes are a closed enum shared by the API and UI: `UNSCOPED`, `REQUIREMENT_NOT_BASELINED`, `CR_NOT_APPROVED`, `ALREADY_INVOICED`, `CURRENCY_MISMATCH`. Entries on archived projects remain invoiceable if eligible, because archiving blocks only *new* work (BR-029).

## 5. Scope baseline

```mermaid
flowchart LR
    D[Draft requirements] -->|edit freely| D
    D -->|Create baseline| BL[Baseline N: content hash<br/>requirements frozen in place]
    BL --> FR[Requirements frozen]
    FR -->|change needed| CR[Change request]
    D2[New draft requirements e.g. phase 2] -->|Create baseline| BL2[Baseline N+1]
```

# Part B — User flows

Screen IDs refer to [screen specifications](screen-specifications.md#2-screen-inventory). Diamonds are user or system decisions. **Bold** steps need a human confirmation dialog (L2–L4 in the [design system](ui-ux-design-system.md#78-dialogs-and-confirmation-flows)).

## UF-1 First-run setup (J1)

```mermaid
flowchart LR
    A[Register S-01] --> B[Name workspace] --> C[Dashboard S-14<br/>setup checklist]
    C --> D[Add client S-02] --> E[Create project S-04]
    E --> F[Add requirements S-05] --> G{Agreed with client?}
    G -->|not yet| F
    G -->|yes| H["Baseline scope (L2)"] --> I[Project overview:<br/>original scope frozen]
    C -.optional, owner.-> J["Enable AI in Settings S-12<br/>disclosure acknowledged"]
```

## UF-2 Handle a client's extra request (J2, the core flow)

```mermaid
flowchart TD
    A[Client message arrives<br/>outside the app] --> B[Record change request S-06<br/>paste verbatim text]
    B --> C[CR detail S-07 · v1 DRAFT]
    C --> D{AI enabled?}
    D -->|yes| E[Analyse with AI] --> F{Result}
    F -->|suggestion| G[Review side by side<br/>apply fields, edit]
    F -->|failure or timeout| H[Banner: write manually]
    D -->|no| H
    G --> I[Confirm effort and pricing<br/>add assumptions]
    H --> I
    I --> J{Complete?<br/>BR-007}
    J -->|no: 422 field list| I
    J -->|yes| K["Propose to client (L2)<br/>v1 frozen + hash"]
    K --> L[Open client summary S-08<br/>print or copy and send]
    L --> M[Wait: CR shows in Approvals S-15]
```

## UF-3 Record the client's decision (J2 continued)

```mermaid
flowchart TD
    A[Client replies<br/>email, chat or call] --> B[Open CR from Approvals S-15<br/>or Dashboard S-14]
    B --> C["Record client decision (L3)<br/>name, date, channel, evidence, confirm"]
    C --> D{Server checks<br/>state + hash}
    D -->|409 changed or decided| E[Conflict banner → reload]
    D -->|ok| F{Decision}
    F -->|Approved| G[Scope strip: authorised<br/>primary action: Create tasks]
    G --> H["Create tasks from version<br/>tasks linked to CR-n vN"]
    F -->|Client asked for changes| I[Create new version<br/>edit → propose again]
    F -->|Rejected| J[Nothing authorised<br/>optionally create new version]
    I --> C
```

## UF-4 Deliver and invoice (J3, J4)

```mermaid
flowchart TD
    A[Tasks S-09<br/>only scoped tasks are billable] --> B[Log time or fixed work]
    B --> C[Project billing S-10]
    C --> D{Eligible?<br/>server classification}
    D -->|no| E[Fix: link to scope,<br/>baseline, or get CR approved]
    E --> C
    D -->|yes| F[Select entries → Create invoice draft]
    F --> G[Invoice draft S-11<br/>server-computed totals]
    G --> H{Adjustments?}
    H -->|yes| I[Add adjustment + reason] --> G
    H -->|no| J{Role}
    J -->|member| K[PermissionNotice:<br/>ask an owner]
    J -->|owner| L["Issue invoice (L4)<br/>number assigned, frozen"]
    L --> M[Print or save PDF and send]
```

## UF-5 Error and permission paths (cross-cutting)

```mermaid
flowchart LR
    A[Any action] --> B{Response}
    B -->|401| C[Sign in → return to page]
    B -->|403| D[PermissionNotice: who can act]
    B -->|404| E[Not found: missing or other workspace]
    B -->|409 or 412| F[Conflict banner → reload]
    B -->|422| G[Field errors + ErrorSummary]
    B -->|5xx or network| H[ErrorState with retry + request ID]
    B -->|2xx| I[Toast or live announcement + refresh]
```

## Human decisions versus automation

| Step | Who or what | Can it be automated? |
| --- | --- | --- |
| Capture the client's request text | Human (paste) | Email/chat intake is post-MVP. It would still create a **draft** only |
| Clarify scope, suggest effort, list assumptions and risks | **AI suggests**, human edits | Yes, as a suggestion only (BR-001) |
| Compute price from confirmed effort or a fixed amount | **Application** (deterministic) | Yes. It is never done by AI (BR-020, BR-027) |
| Propose (freeze) a version | **Human** (L2) | No |
| Approve, reject or request changes | **Client** decides. **Human** records it (L3) | No. AI and automation can never record decisions (BR-002) |
| Supersede old approved version, recompute CR status, write audit | **Application** | Yes, automatically inside the same transaction |
| Create tasks from an approved version | **Human** triggers, application creates | Pre-filled from acceptance criteria, confirmed by a human |
| Classify entry eligibility | **Application** | Yes (BR-016) |
| Compute invoice lines, tax and totals | **Application** | Yes (BR-020). Client and AI values are ignored |
| Issue or void an invoice | **Owner** (L4) | No (BR-023) |
| Assign invoice number | **Application** | Yes, inside the issue transaction |
