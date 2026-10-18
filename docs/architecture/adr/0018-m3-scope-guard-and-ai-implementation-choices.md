# ADR-0018: M3 Scope Guard and AI implementation choices

- **Status:** Accepted
- **Date:** 2026-10-17
- **Related:** FR-020–FR-029, FR-032, FR-050–FR-054, BR-001–BR-014, BR-026–BR-028, ADR-0005, ADR-0006, ADR-0012, ADR-0015, ADR-0017

## Context
M3 implements change requests with immutable, hash-bound versions; recorded client decisions; and advisory AI analysis through a provider port. The requirements and data model fix the behaviour, but several implementation details were open:
- how transitions are guarded;
- what the hash covers;
- how idempotency is stored;
- how failures map to HTTP;
- how the mock provider is selected;
- how pricing is frozen.

The maintainer's milestone brief also groups AI analysis into this milestone. The roadmap had it in a separate M4, so this ADR records the merge.

## Decision
1. **Modules.**
   - `scope-guard` owns `changeRequests` and `approvals`.
   - `ai` owns `aiGenerations` and imports **no** domain module (BR-001, TC-ARCH-01).
   - `scope-guard` uses `core-ops`, `workspace`, `audit` and `ai` through their `index.ts`.
   - `core-ops` exposes `lockProjectForChildWrite(ctx, projectId, tx, counter?)`. Every CR write runs the BR-029 guard and the project touch (ADR-0017 §4) inside its transaction, which allocates CR numbers too.
2. **One write path for versions (ADR-0015).**
   - The repository's `writeVersions` is the only function that changes versions. It writes the whole bounded `versions` array (≤ 50), the pointers derived from it (`openVersionNumber`, `approvedVersionNumber`, `latestVersionNumber`) and `derivedStatus = deriveCrStatus(versions)` in one single-document update.
   - That update is guarded by the `rowVersion` read in the same transaction plus a state condition, such as `$elemMatch { number, state: 'PROPOSED', contentHash }` for decisions.
   - Every transition increments `rowVersion`, so a stale `If-Match` on a draft edit or on propose is `412`, and concurrent transitions conflict.
3. **Content hash (BR-008).** SHA-256 of canonical JSON (sorted keys, bigint as a bare integer) over:
   - the CR ID and version number;
   - title, description, in and out of scope, acceptance criteria;
   - affected requirement IDs, dependencies, assumptions, **risks**;
   - effort range, confirmed effort, **pricing** (mode, rate, price, **currency**) and timeline impact.

   Risks and currency were added to the lifecycle document's list, so that every field shown to the client is bound.
4. **Pricing.**
   - The TIME price is recomputed on every draft save for the preview ("calculated on save") and again at propose. Propose freezes the resolved rate (project override, then workspace default, BR-021) into the version, and the hash covers it.
   - Proposing TIME pricing needs confirmed effort **and a rate > 0**. The workspace default rate is 0 until set, which would otherwise propose a free price by accident.
   - The client never sends a TIME price; the contract has no field for one.
5. **Decisions.**
   - A decision is accepted only for the currently `PROPOSED` version with a matching hash (`409 INVALID_STATE_TRANSITION` / `409 VERSION_HASH_MISMATCH`).
   - The decision date must not be in the future in the **workspace time zone** (`422`).
   - The approval insert relies on the unique index `workspace_cr_version_unique` (one decision per version). A concurrent duplicate becomes `409`.
   - Approving a later version supersedes the earlier approved one (BR-013).
6. **Idempotency (api-design §1).**
   - `runIdempotent` (platform) runs the transition and stores `{ requestHash, response }` in `idempotencyKeys` **inside the same transaction**, so the record exists if and only if the transition committed.
   - The request hash covers the route and the canonical body. A retry with the same key returns the stored response; the same key with a different body, route or user returns `422 IDEMPOTENCY_KEY_REUSED`.
   - Keys are **required** on decisions and optional on propose, withdraw and new version. Failed transitions store nothing.
   - The UI creates one key per opened dialog and keeps it across network-error retries.
7. **Discard.** Only a never-proposed revision draft (v ≥ 2) can be discarded. Version 1 is always edited, never deleted, so a CR is never left without versions.
8. **AI analysis (FR-021).** These are the controls in ai-architecture §6:
   - the prompt is `cr-analysis@1` and the output schema `cr-analysis-output@1`. Client text is delimited, and delimiter tags inside data are neutralised;
   - the payload is minimised to the request text, project name and description, and requirement keys, titles and short descriptions;
   - one overall `AbortController` deadline (`AI_TIMEOUT_MS`);
   - at most `AI_MAX_RETRIES` jittered retries for `NETWORK`, `SERVER_ERROR` and `RATE_LIMITED` only. `AUTH_FAILED`, `BAD_REQUEST` and `BAD_RESPONSE` are never retried;
   - exactly one repair call quoting the validation errors;
   - output over 60,000 characters is refused before parsing, and response bodies over 1 MB are refused by the adapter;
   - unknown properties are stripped, and unknown requirement keys are dropped with a warning;
   - every call records an `aiGenerations` document with prompt and schema versions, provider, model, status, error code, latency, tokens and input hash. The prompt is stored only when `AI_STORE_PROMPTS=true`;
   - the safe structured log `ai.generation` carries IDs and codes only.
9. **HTTP mapping of AI failures.**

   | Situation | Response |
   | --- | --- |
   | No provider, or provider unconfigured | `409 AI_DISABLED` |
   | Workspace has not opted in | `409 AI_DISABLED`, before any provider call |
   | Timeout | `504 AI_TIMEOUT` |
   | Provider or network errors after retries | `502 AI_PROVIDER_ERROR` |
   | Invalid output after the repair attempt | `502 AI_INVALID_OUTPUT` |
   | Workspace rate limit, or one concurrent analysis per version | `429` |

   Messages never contain provider bodies, URLs or keys. The draft is never changed.
10. **The `mock` adapter** is selected by `AI_PROVIDER=mock`, and **refused in production** by config. Its scenario is chosen by a `[mock:<name>]` tag in the client text, so E2E can exercise failure paths through the real API.

    Integration tests instead inject a scripted provider through `createApp({ aiProvider })`. The real `openai-compatible` adapter is tested against a local HTTP stub, so CI never calls a real endpoint.
11. **AI enablement (FR-054)** lives in the `workspace` module: `PUT {ws}/ai-enablement` is owner-only, and the contract requires `acknowledgeDisclosure: true` when enabling.
    - Enabling is refused while the provider is unconfigured.
    - Both directions are audited (`workspace.ai_enabled` / `workspace.ai_disabled`) and bump the workspace `rowVersion`.
    - `GET {ws}/ai/status` returns the provider type, model, health (a 3-second `/models` probe), the workspace flag and the disclosure text. It never returns the URL or the key.
12. **Provenance (FR-022).** Applying an AI field sends `aiFieldProvenance: { field: generationId }` with the draft edit. The server accepts only a successful generation of the **same CR**. A human edit sends `null` and clears the badge.
13. **Approvals queue (FR-032)** filters on the cached `derivedStatus` with the index `{ workspaceId, derivedStatus, updatedAt, _id }`. It lists the oldest activity first and uses keyset pagination.

## Alternatives considered
- **Array filters (`versions.$[v]`) instead of rewriting the array:** smaller writes, but `TenantCollection` would need an `arrayFilters` option, and pointers plus derived status would still need recomputing. With at most 50 versions, rewriting under a row-version guard is simpler and provably consistent.
- **An idempotency middleware outside the transaction:** cannot guarantee "stored if and only if committed" for decisions (backend-architecture: "written inside the business transaction").
- **Retrying every provider error:** wastes the budget on non-retryable failures (bad key) and delays the manual fallback.
- **Validating `AI_BASE_URL` at startup:** contradicts AC-022.2 (startup succeeds with a bad endpoint).

## Rationale
Every business rule stays server-side, transactional where it spans documents (BR-028), and tenant-scoped (ADR-0012). The AI stays a pure data producer with no path to any state change (BR-001–BR-003).

## Consequences
- The `cr-analysis@1` prompt and schema are frozen. Any text change means `@2`.
- No model has been evaluated. The evaluation harness and dataset (ai-architecture §7) are **not built yet**, and no model is recommended.
- `IDEMPOTENCY_KEY_REUSED` is a real user-visible error if a client reuses keys. The web UI generates a fresh key per action.
- The analysis concurrency guard and the AI rate limit are in memory per API process, like the auth limits (known limitations).

## Security and operational implications
- Every new route is in the TC-SEC-01 cross-workspace matrix, plus TC-SEC-01d (another workspace's CR IDs used in one's own workspace), and enablement is in the TC-SEC-03 owner-only list.
- Mutation checks confirm each control is load-bearing: hash check, supersede, draft-only edits, workspace AI opt-in, one open version, decision date, propose completeness, derived-status recomputation, repair attempt and retryable-only retries.
- The AI module cannot import domain modules (lint). Its only write is `aiGenerations`.
