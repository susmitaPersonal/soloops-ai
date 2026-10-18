---
name: soloops-security-review
description: Security review checklist and procedure for SoloOps AI — authentication, sessions, workspace isolation, role checks, input validation, secrets, audit integrity, money/approval tampering, AI data sharing and prompt injection, dependencies. Use for any change touching auth, tenancy, approvals, billing, AI data flow, configuration or dependencies, and before releases.
---

# SoloOps security review

## Purpose
Find concrete, evidenced security defects before they ship, and recommend specific mitigations.

## When to use
- Changes to auth, sessions, membership or roles.
- New tenant endpoints or queries.
- Approval or invoice logic.
- AI payloads or prompts.
- Config, secrets or logging changes.
- New dependencies.
- Release readiness.

## Required inputs
The diff or files under review, plus the relevant requirements (SEC-xxx, PRV-xxx, BR-xxx).

## Procedure
1. Read [security-architecture.md](../../../docs/architecture/security-architecture.md) and the SEC and PRV tables in [requirements.md](../../../docs/product/requirements.md).
2. Walk through the checklist and look for evidence in code, not assumptions:
   - **AuthN:**
     - argon2id
     - generic errors
     - session token hashed at rest
     - rotation on login, expiry, logout invalidation
     - cookie flags
   - **Tenancy:**
     - every route under `{ws}` uses `requireMembership`
     - every repository query includes `workspaceId`
     - `TenantCollection` used everywhere. No raw `mongodb` access outside `platform/db`
     - referenced IDs loaded within the same workspace before linking
     - no unvalidated objects used as MongoDB filters (operator injection)
     - foreign IDs → 404
     - endpoint present in the isolation matrix
   - **AuthZ:** owner-only actions (settings, members, AI enablement, issue/void, export) are checked server-side.
   - **Input:**
     - Zod on body, params and query
     - length limits, body size limit
     - no mass-assignment of `workspaceId`, `state`, totals or `role`
   - **Integrity:**
     - approvals immutable and hash-checked
     - client totals ignored
     - invoice issue transactional and idempotent
     - audit written in the same transaction
     - no update/delete paths for append-only collections (`approvals`, `auditEvents`)
   - **CSRF and headers:** custom header plus Origin check, secure headers, CSP. Same-origin `/api` routing (ADR-0013).
   - **Next.js:** no caching of per-user data, no secrets or `NEXT_PUBLIC_*` leaks, no business logic in Server Actions or Route Handlers, `server-only` on server helpers.
   - **Secrets and logs:** env-only secrets, redaction, no client PII or raw CR text in logs.
   - **AI:**
     - minimised payload
     - opt-in disclosure
     - delimiters around client text
     - no tools or write path
     - output escaped
     - rate limits
     - key never logged
   - **Dependencies:** lockfile changes justified, `npm audit` clean at high level, license compatible.
3. For each finding, record:
   - title
   - severity (Critical, High, Medium or Low), with a reason
   - evidence (file:line, request or reproduction)
   - affected requirement
   - concrete fix
   - test to add
4. Do not report speculative issues as confirmed. Label them "needs verification" and state what would confirm them.

## Output
A findings table ordered by severity, plus a short summary of what was checked and found clean.

## Quality checklist
- [ ] Every finding has evidence and a fix.
- [ ] Tenant isolation is checked for every new query and endpoint.
- [ ] AI data flow is reviewed when relevant.
- [ ] No secrets appear in the review output itself.
