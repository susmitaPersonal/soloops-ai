# API Design

> **Status:** Proposed. **Implemented in M1:** `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me`, `GET`/`PATCH {ws}`, `/healthz`, `/readyz`. **Implemented in M2:** every Core Ops endpoint below except `…/overview` (FR-015). Implementation choices: [ADR-0017](adr/0017-m2-core-ops-implementation-choices.md). **Implemented in M3:** every Scope Guard endpoint below except `…/versions/{n}/tasks` (FR-030), plus `GET {ws}/ai/status` and `PUT {ws}/ai-enablement` ([ADR-0018](adr/0018-m3-scope-guard-and-ai-implementation-choices.md)). **Implemented in M4:** `…/versions/{n}/tasks` (FR-030), `…/billable-entries` (GET, POST, and GET / PATCH / DELETE by ID) and `…/overview` (FR-015) ([ADR-0019](adr/0019-m4-delivery-and-billable-work-implementation-choices.md)). **Implemented in M5:** every `{ws}/invoices` endpoint below ([ADR-0020](adr/0020-m5-invoice-implementation-choices.md)). `Idempotency-Key` is processed on decisions, invoice issue and void (**required**), and on propose, withdraw, new version, conversion to tasks, entry creation and invoice drafts (optional). Their request and response shapes live in `packages/contracts`. Once implemented, an OpenAPI 3.1 document will be **generated from the Zod schemas** (generator chosen in M1, see [ADR-0010](adr/0010-hono-api-on-node.md)) and served at `/api/v1/openapi.json`. That generated spec then becomes authoritative for request and response shapes, and this document covers conventions and the inventory.

## 1. Conventions

- **Base path:** `/api/v1`. Breaking changes require `/api/v2`. Additive changes (new optional fields or endpoints) are allowed within v1.
- **Format:** JSON, `camelCase` fields. Amounts are integer minor units **serialised as strings** (`"1200000"`) to avoid JavaScript precision loss with `BigInt`. Dates are `YYYY-MM-DD`, timestamps are ISO 8601 UTC, and IDs are UUIDs.
- **Tenancy:** tenant resources live under `/api/v1/workspaces/{workspaceId}/…`.
- **Auth:** session cookie `soloops_sid`. State-changing requests need the `X-Requested-With: soloops` header and a same-origin `Origin`.
- **Pagination:** cursor-based. Query parameters are `?limit=50&cursor=<opaque>`, and responses look like `{ "items": [...], "nextCursor": "..." | null }`. The maximum `limit` is 100.
- **Filtering and sorting:** explicit, whitelisted query params per endpoint (for example `?status=AWAITING_DECISION`).
- **Concurrency:** `ETag` on mutable resources and `If-Match` required on `PATCH`.
- **Idempotency:** `Idempotency-Key` header (UUID) on transition endpoints. See [backend](backend-architecture.md#idempotency).

## 2. Status codes

| Code | Meaning |
| --- | --- |
| 200 / 201 / 204 | OK / created / no content |
| 400 | Malformed JSON |
| 401 | Not authenticated (`UNAUTHENTICATED`), or sign-in failed (`INVALID_CREDENTIALS`: same body for an unknown email and a wrong password) |
| 403 | Authenticated member lacks the role (`FORBIDDEN`), or the CSRF check failed (`CSRF_REJECTED`) |
| 404 | Not found **or not in your workspace** |
| 409 | State conflict (`INVALID_STATE_TRANSITION`, `VERSION_HASH_MISMATCH`, `ALREADY_INVOICED`, `AI_DISABLED`, `ARCHIVED`, `BASELINE_LOCKED`: a baselined requirement cannot be edited or deleted, AC-007.2) |
| 412 | `If-Match` mismatch (`PRECONDITION_FAILED`) |
| 413 | Body larger than 256 KB (`PAYLOAD_TOO_LARGE`) |
| 428 | `If-Match` missing on a `PATCH` (`PRECONDITION_REQUIRED`) |
| 422 | Validation failed (`VALIDATION_FAILED`, `NOT_ELIGIBLE`, `IDEMPOTENCY_KEY_REUSED`), or registration refused (`REGISTRATION_FAILED`, generic, AC-001.2). An ID **in the request body** that is missing or belongs to another workspace is a `VALIDATION_FAILED` field error with the same message either way; an ID **in the path** is `404` (ADR-0017 §5) |
| 429 | Rate limited |
| 502 / 503 / 504 | AI provider error (`AI_PROVIDER_ERROR`, `AI_INVALID_OUTPUT`), service unavailable, AI timeout (`AI_TIMEOUT`). 502/504 occur on AI endpoints only, and the draft is never changed |

## 3. Error format (RFC 9457)

```json
{
  "type": "urn:soloops:problem:validation-failed",
  "title": "Validation failed",
  "status": 422,
  "code": "VALIDATION_FAILED",
  "detail": "The proposal is incomplete.",
  "errors": [
    { "path": "assumptions", "message": "At least one assumption is required." }
  ],
  "requestId": "01J…"
}
```

The `type` is a URN identifier, so the project does not need to own a domain for it.

## 4. Endpoint inventory

Unless stated otherwise, paths are relative to `/api/v1`, and `{ws}` means `/workspaces/{workspaceId}`. Columns: **Auth** M = member, O = owner. **Idem** ✓ = Idempotency-Key supported, R = required.

### Identity and workspace
| Method | Path | Auth | Idem | Req |
| --- | --- | --- | --- | --- |
| POST | `/auth/register` | public | | FR-001, FR-003 |
| POST | `/auth/login` | public | | FR-002 |
| POST | `/auth/logout` | session | | FR-002 |
| GET | `/auth/me` | session | | FR-002 |
| GET / PATCH | `{ws}` (settings) | M / O | | FR-005 |
| PUT | `{ws}/ai-enablement` | O | | FR-054 |
| GET / POST | `{ws}/members` | M / O | | FR-004 |
| DELETE | `{ws}/members/{userId}` | O | | FR-004 |

### Core Ops
| Method | Path | Auth | Idem | Req |
| --- | --- | --- | --- | --- |
| GET / POST | `{ws}/clients` (`?archived=true&limit=&cursor=`) | M | | FR-010 |
| GET / PATCH | `{ws}/clients/{clientId}` | M | | FR-010 |
| POST | `{ws}/clients/{clientId}/archive` | M | | FR-010 |
| GET / POST | `{ws}/projects` (`?clientId=&archived=true&limit=&cursor=`) | M | | FR-011 |
| GET / PATCH | `{ws}/projects/{projectId}` | M | | FR-011 |
| POST | `{ws}/projects/{projectId}/archive` | M | | FR-011 |
| GET | `{ws}/projects/{projectId}/overview` (counts and the eligible unbilled total) | M | | FR-015 |
| GET / POST | `{ws}/projects/{projectId}/requirements` | M | | FR-012 |
| PATCH / DELETE | `{ws}/requirements/{requirementId}` | M | | FR-012, BR-004 |
| GET / POST | `{ws}/projects/{projectId}/baselines` (no body; a retry with nothing left to freeze is `422`, so it is retry-safe without the planned `Idempotency-Key` middleware, ADR-0017 §12) | M | ✓ | FR-013 |
| GET / POST | `{ws}/projects/{projectId}/tasks` (`?status=&assigneeUserId=&limit=&cursor=`) | M | | FR-014 |
| GET / PATCH | `{ws}/tasks/{taskId}` | M | | FR-014 |

### Scope Guard
| Method | Path | Auth | Idem | Req |
| --- | --- | --- | --- | --- |
| GET / POST | `{ws}/projects/{projectId}/change-requests` (`?status=`) | M | | FR-020 |
| GET | `{ws}/change-requests` (`?status=AWAITING_DECISION,NEEDS_REVISION&projectId=&cursor=`), the workspace-wide approvals queue | M | | FR-032 |
| GET | `{ws}/change-requests/{crId}` (CR, versions, decisions) | M | | FR-028 |
| POST | `{ws}/change-requests/{crId}/versions` (new draft) | M | ✓ | FR-026 |
| GET / PATCH | `{ws}/change-requests/{crId}/versions/{n}` | M | | FR-022 |
| DELETE | `{ws}/change-requests/{crId}/versions/{n}` (never-proposed draft only) | M | | FR-022 |
| POST | `{ws}/change-requests/{crId}/versions/{n}/analyze` | M | ✓ | FR-021 |
| POST | `{ws}/change-requests/{crId}/versions/{n}/propose` | M | ✓ | FR-024 |
| POST | `{ws}/change-requests/{crId}/versions/{n}/withdraw` | M | ✓ | FR-029 |
| POST | `{ws}/change-requests/{crId}/versions/{n}/decisions` | M | R | FR-025 |
| POST | `{ws}/change-requests/{crId}/versions/{n}/tasks` | M | ✓ | FR-030 |
| GET | `{ws}/change-requests/{crId}/versions/{n}/summary` | M | | FR-027 |
| GET | `{ws}/change-requests/{crId}/diff?from=1&to=2` | M | | FR-028 |

### Billing
| Method | Path | Auth | Idem | Req |
| --- | --- | --- | --- | --- |
| GET / POST | `{ws}/projects/{projectId}/billable-entries` (`?state=unbilled`) | M | | FR-040, FR-041 |
| GET / PATCH / DELETE | `{ws}/billable-entries/{entryId}` (PATCH needs `If-Match`; invoiced → `409 ALREADY_INVOICED`) | M | | FR-040 |
| GET / POST | `{ws}/invoices` | M | ✓ | FR-042 |
| GET / PATCH / DELETE | `{ws}/invoices/{invoiceId}` (PATCH with `If-Match`: `lineDescriptions`, `removePositions`, `addAdjustments`; PATCH and DELETE on drafts only) | M | | FR-043 |
| POST | `{ws}/invoices/{invoiceId}/issue` | **O** | R | FR-044 |
| POST | `{ws}/invoices/{invoiceId}/void` | **O** | R | FR-046 |

### AI, audit, community, ops
| Method | Path | Auth | Req |
| --- | --- | --- | --- |
| GET | `{ws}/dashboard` (read-only summary: awaiting decisions, recent decisions, eligible unbilled per project, draft invoices, ineligible counts, setup checklist) | M | FR-017 |
| GET | `{ws}/ai/status` | M | FR-053 |
| GET | `{ws}/audit-events?entityType=&entityId=` | M | FR-016 |
| GET | `{ws}/export` | O | FR-061 |
| GET | `/healthz`, `/readyz` (outside `/api/v1`) | public | NFR-010 |

## 5. Rate limits (initial values, tune after measurement)

| Scope | Limit |
| --- | --- |
| `/auth/login`, `/auth/register` | 10 / 15 min per IP + email (**implemented**) |
| `/auth/login` | 50 / 15 min per email from any IP, and `RATE_LIMIT_AUTH_PER_IP` (default 30) / 15 min per IP across emails (**implemented**) |
| `/auth/register` | `RATE_LIMIT_REGISTER_PER_IP` (default 10) / hour per IP (**implemented**) |
| `.../analyze` | `RATE_LIMIT_AI_PER_HOUR` (default 20) / hour per workspace and 1 concurrent per version (**implemented**, in memory per process) |
| All others | 300 / min per session |

## 6. Versioning and deprecation

Responses include `API-Version: 1`. Deprecated fields are documented for one minor release before removal in the next major version.

## 7. Examples

### Record a change request

```http
POST /api/v1/workspaces/9b1d…/projects/4c2a…/change-requests
Content-Type: application/json
X-Requested-With: soloops

{
  "rawRequestText": "Can you also add login with WhatsApp OTP? Need it before Diwali sale.",
  "sourceChannel": "CHAT",
  "requestedByName": "S. Das",
  "receivedOn": "2026-10-12"
}
```
```http
201 Created
{
  "id": "0b7e…", "number": 3, "displayKey": "CR-3", "status": "DRAFT",
  "versions": [{ "versionNumber": 1, "state": "DRAFT", "rowVersion": 1 }]
}
```

### AI analysis (suggestion only)

```http
POST /api/v1/workspaces/9b1d…/change-requests/0b7e…/versions/1/analyze
Idempotency-Key: 5f0c…
```
```http
200 OK
{
  "generationId": "a1c3…",
  "promptVersion": "cr-analysis@1",
  "suggestion": {
    "clarifiedDescription": "Add phone-number login using a one-time password delivered via WhatsApp…",
    "inScope": ["OTP request and verification endpoints", "Login screen option"],
    "outOfScope": ["SMS fallback", "WhatsApp Business account setup costs"],
    "acceptanceCriteria": ["User receives OTP within 30 s", "OTP expires after 5 min"],
    "affectedRequirementKeys": ["REQ-2"],
    "dependencies": ["Client provides a WhatsApp Business API provider account"],
    "assumptions": ["Existing user table has a verified phone field"],
    "effortHours": { "low": 6, "likely": 8, "high": 14 },
    "risks": [{ "description": "Provider approval may take days", "severity": "MEDIUM" }],
    "timelineImpact": "Likely 2–4 working days, depending on provider approval",
    "questionsForClient": ["Should existing email login remain?"]
  },
  "indicativeCost": { "currency": "INR", "lowMinor": "900000", "likelyMinor": "1200000", "highMinor": "2100000", "hourlyRateMinor": "150000" },
  "warnings": []
}
```

The draft version is **not** modified. The cost range is computed by the API from the resolved rate (BR-027).

### Record a decision

```http
POST /api/v1/workspaces/9b1d…/change-requests/0b7e…/versions/2/decisions
Idempotency-Key: 7d21…
{
  "decision": "APPROVED",
  "contentHash": "3f9a…c1",
  "clientDecisionMakerName": "S. Das",
  "decidedOn": "2026-10-14",
  "channel": "EMAIL",
  "evidenceNote": "Email 'Re: Proposal CR-3 v2' 14 Oct 10:42"
}
```
```http
201 Created
{ "approvalId": "e9…", "versionState": "APPROVED", "supersededVersion": null }
```

Error example (hash mismatch):
```http
409 Conflict
{ "code": "VERSION_HASH_MISMATCH", "status": 409, "title": "Proposal changed", "detail": "The version you approved does not match the stored proposal." }
```

### Issue an invoice

```http
POST /api/v1/workspaces/9b1d…/invoices/71aa…/issue
Idempotency-Key: c4f8…
```
```http
200 OK
{ "id": "71aa…", "status": "ISSUED", "displayNumber": "SO-0007", "subtotalMinor": "1500000", "taxMinor": "270000", "totalMinor": "1770000", "currency": "INR" }
```
