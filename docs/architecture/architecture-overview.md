# Architecture Overview

> **Status:** Proposed. No code exists yet ([repository assessment](../repository-assessment.md)). When implementation diverges, update this document or write an ADR. Never leave them inconsistent.

## Key decisions at a glance

| Concern | Decision | ADR |
| --- | --- | --- |
| Web | Next.js App Router + React + TypeScript. Presentation only | [0009](adr/0009-nextjs-app-router-frontend.md) |
| API | Hono on Node.js + TypeScript. The only home of business logic | [0010](adr/0010-hono-api-on-node.md) |
| Shape | Modular monolith API + separate web app | [0003](adr/0003-modular-monolith.md) |
| Monorepo | npm workspaces. `packages/contracts` (Zod), `packages/api-client`, `packages/config` | [0011](adr/0011-monorepo-packages-and-contracts.md) |
| Data | MongoDB replica set, native driver, tenant-scoped data-access layer, transactions | [0012](adr/0012-mongodb-and-data-access.md) |
| Transport | Same-origin `/api/*`. Server Components fetch the API with forwarded cookies | [0013](adr/0013-web-api-communication.md) |
| Auth | Server-side sessions, argon2id, cookies, workspace membership checks | [0004](adr/0004-authentication-and-sessions.md) |
| AI | Provider-independent port: `none`, `mock`, `openai-compatible` | [0005](adr/0005-ai-provider-abstraction.md) |
| Approvals | Immutable proposal versions with hash-bound decisions | [0006](adr/0006-versioned-approvals.md) |
| Money | Integer minor units, computed only in the API | [0007](adr/0007-financial-calculations.md) |
| Testing | Vitest, in-process Hono requests on a real MongoDB, RTL, Playwright | [0014](adr/0014-testing-strategy-for-next-hono-mongodb.md) |

## 1. Monorepo structure

```mermaid
flowchart TB
    subgraph repo[npm workspaces monorepo]
        subgraph apps
            WEB["apps/web<br/>Next.js App Router<br/>UI only"]
            API["apps/api<br/>Hono on Node<br/>business logic + data"]
        end
        subgraph packages
            CON["packages/contracts<br/>Zod DTOs, enums, error codes"]
            CLI["packages/api-client<br/>typed fetch client"]
            CFG["packages/config<br/>tsconfig, ESLint boundaries, Prettier"]
        end
        E2E["e2e<br/>Playwright"]
    end
    WEB --> CLI --> CON
    WEB --> CON
    API --> CON
    E2E --> CLI
    API --> MDB[(MongoDB)]
```

Details, responsibilities and enforcement are in [monorepo structure](monorepo-structure.md).

## 2. System components

```mermaid
flowchart LR
    U[Freelancer / member<br/>browser] -->|HTTPS, one origin| RP[Reverse proxy<br/>TLS]
    RP -->|"/*"| WEB[Next.js server<br/>RSC + static assets]
    RP -->|"/api/*"| API[Hono API]
    WEB -->|"server-side GETs<br/>API_INTERNAL_URL + forwarded cookie"| API
    subgraph API_internals[apps/api]
        MW[platform middleware<br/>requestId · logging · secure headers · CSRF ·<br/>rate limit · session · membership · idempotency · errors]
        MODS[modules<br/>identity · workspace · core-ops · scope-guard ·<br/>billing · ai · audit · community · dashboard]
        DAL[platform/db<br/>TenantCollection · withTransaction · migrations]
        MW --> MODS --> DAL
    end
    API --- MW
    DAL --> DB[(MongoDB<br/>replica set)]
    MODS -->|optional, HTTPS| LLM[Open-weight model endpoint<br/>OpenAI-compatible]
    CL[Client] -.receives proposal summary / invoice<br/>outside the system.-> U
```

The client has **no direct connection** to the system in the MVP.

## 3. Request flow (example: record a client decision)

```mermaid
sequenceDiagram
    autonumber
    actor B as Browser (Client Component)
    participant P as Proxy (/api/*) or Next rewrite (dev)
    participant H as Hono API
    participant S as scope-guard service
    participant D as platform/db (TenantCollection)
    participant M as MongoDB

    B->>P: POST /api/v1/workspaces/{ws}/change-requests/{cr}/versions/2/decisions<br/>Cookie, X-Requested-With, Idempotency-Key
    P->>H: forward unchanged
    H->>H: requestId → CSRF (Origin + header) → session → requireMembership(ws) → Zod validate → idempotency lookup
    H->>S: recordDecision(ctx, input)
    S->>D: withTransaction
    D->>M: insert approvals {ws, cr, v2, hash} (unique index)
    D->>M: updateOne changeRequests {_id, workspaceId, versions.2.state: PROPOSED, contentHash}<br/>set APPROVED, supersede previous, approvedVersionNumber
    D->>M: insert auditEvents
    M-->>D: commit (or abort → 409 on unique/conditional failure)
    S-->>H: result
    H->>H: store idempotency response
    H-->>B: 201 JSON (or problem+json)
    B->>B: router.refresh() → Server Components re-fetch via API
```

Read path: a Server Component calls `serverApi.get('/api/v1/...')`. That call goes straight to `API_INTERNAL_URL` with the user's `Cookie` header and `cache: 'no-store'`, and runs through the same middleware chain ([ADR-0013](adr/0013-web-api-communication.md)).

## 4. Core business workflow mapped to components

```mermaid
flowchart LR
    subgraph web[apps/web screens]
        S5[S-05 Requirements] --- S7[S-07 CR workspace] --- S10[S-10 Unbilled work] --- S11[S-11 Invoice]
    end
    subgraph api[apps/api modules]
        CO[core-ops<br/>clients · projects · requirements · baselines · tasks]
        SG[scope-guard<br/>CRs · versions · decisions]
        AI[ai<br/>analysis suggestions only]
        BI[billing<br/>entries · eligibility · invoices]
        AU[audit]
    end
    subgraph db[MongoDB collections]
        C1[(projects · requirements · baselines · tasks)]
        C2[(changeRequests · approvals)]
        C3[(billableEntries · invoices · workspaces.counter)]
        C4[(aiGenerations)]
        C5[(auditEvents)]
    end
    S5 --> CO --> C1
    S7 --> SG --> C2
    SG -->|AnalyzerPort| AI --> C4
    SG -->|approved version → tasks| CO
    S10 --> BI
    S11 --> BI --> C3
    BI -->|reads authorisation state| SG
    BI -->|reads baselines/tasks| CO
    CO --> AU
    SG --> AU
    BI --> AU --> C5
```

Business sequence: baseline requirements → record CR → optional AI suggestion → propose (freeze + hash) → record decision → convert to tasks → log entries → eligibility → invoice draft → owner issues. The step-by-step flows are in [workflows](../design/workflows.md), and the states are in [change-request lifecycle](../design/change-request-lifecycle.md).

## Dependency direction (inside the API)

```mermaid
flowchart LR
    routes[routes.ts<br/>Hono sub-app] --> service[service.ts] --> repo[repository.ts] --> dal[platform/db]
    service --> domain[domain/*<br/>pure functions]
    routes --> contracts["@soloops/contracts"]
```

Rules:
1. Modules import each other only via `index.ts`.
2. `ai` imports no domain module.
3. Only `platform/db` imports `mongodb`.
4. Repositories use `TenantCollection`.
5. `domain/` is pure.

## Cross-cutting concerns

| Concern | Approach | Detail |
| --- | --- | --- |
| Tenant isolation | Workspace in the URL. `requireMembership`. `TenantCollection` injects `workspaceId`. Foreign IDs → 404 | [security](security-architecture.md), [data model](data-model.md) |
| Validation | Zod contracts shared by web forms and API validators | [monorepo](monorepo-structure.md) |
| Errors | RFC 9457 problem+json with a stable `code` | [API design](api-design.md) |
| Audit | `auditEvents` inserted inside the same MongoDB transaction | [data model](data-model.md) |
| Caching | No caching of authenticated data in Next.js or the API | [frontend](frontend-architecture.md) |
| Observability | pino JSON logs with request ID propagated web → API. `/healthz`, `/readyz` | [deployment](deployment-architecture.md) |

## External dependencies

| Dependency | Required? | Notes |
| --- | --- | --- |
| MongoDB (replica set) | Yes | Single-node replica set for local and CI. Version pinned in M1 |
| Model inference endpoint | No | Any OpenAI-compatible chat completions endpoint. Cost depends on the operator |
| Email / payments / chat apps | No | Out of scope for MVP |

## Further reading

[Monorepo structure](monorepo-structure.md) · [Frontend](frontend-architecture.md) · [Backend](backend-architecture.md) · [Data model](data-model.md) · [API design](api-design.md) · [AI](ai-architecture.md) · [Security](security-architecture.md) · [Deployment](deployment-architecture.md) · [Testing strategy](testing-strategy.md) · [ADRs](adr/README.md)
