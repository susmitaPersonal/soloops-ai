# AI Architecture

> **Status:** **Implemented in M3** ([ADR-0005](adr/0005-ai-provider-abstraction.md), [ADR-0018](adr/0018-m3-scope-guard-and-ai-implementation-choices.md) §8–12): the `none`, `mock` and `openai-compatible` adapters, prompt `cr-analysis@1`, schema `cr-analysis-output@1` (then `@2` with the scope check of [ADR-0022](adr/0022-scope-check-and-members.md); current: `cr-analysis@3` / `cr-analysis-output@3`, where the server decides coverage from verbatim quotes, [ADR-0023](adr/0023-evidence-gated-scope-check.md)), retries, repair, timeouts, rate limits, generation records, status and enablement. The `openai-compatible` adapter is tested automatically against a local HTTP stub. A real open-weight endpoint (Ollama, `qwen2.5:1.5b`, local) has been exercised manually: an integration smoke test through the UI on 2026-10-18 and through the AI service on 2026-10-19, and the scope-check **evaluation** on 2026-10-19 ([results](../quality/ai-evaluation-results.md): it fails the accuracy threshold) ([release audit §12.4](../quality/release-readiness-audit.md#124-real-open-weight-ai-verification), [§13](../quality/release-readiness-audit.md#13-final-release-closure-2026-10-19)). **No model is recommended.** The scope-check part of the §7 harness is built (`npm run eval:ai`); the human rubric is not. This document makes **no claims** about any model's quality, speed or cost.
>
> **Mock scenarios** (tests and E2E only; `AI_PROVIDER=mock` is refused in production). A `[mock:<name>]` tag in the client text selects one of: `timeout`, `invalid-json`, `invalid-then-valid`, `schema-violation`, `unknown-keys`, `server-error`, `rate-limited`, `auth-failed`, `oversized`, `price-text`. Without a tag, the mock returns a valid suggestion.

## 1. Role of AI in SoloOps

The AI has one MVP feature: **change-request analysis** (FR-021). It turns raw client text into a structured *suggestion* for a draft proposal. It is advisory only ([BR-001 – BR-003](../product/business-rules.md#ai-boundaries)).

| AI may | AI may not |
| --- | --- |
| Clarify the description, propose scope, acceptance criteria, assumptions, dependencies, risks, timeline impact and client questions | Change any entity state, propose, approve, reject or issue anything |
| Suggest an effort range in hours | Set prices, totals or tax. Money is computed by the app (BR-027) |
| Reference requirement keys from the supplied list | Invent requirements (unknown keys are dropped) |

## 2. Components

```mermaid
flowchart LR
    SG[scope-guard service] -->|AnalyzerPort.analyzeChangeRequest| AS[ai/analysis service]
    AS --> PB[prompt builder<br/>cr-analysis@N]
    AS --> PR{ChatModelProvider}
    PR --> NONE[none adapter]
    PR --> MOCK[mock adapter<br/>fixtures for tests]
    PR --> OAC[openai-compatible adapter]
    OAC -->|HTTPS POST /chat/completions| EP[(Operator-configured endpoint)]
    AS --> VAL[Zod output schema<br/>cr-analysis-output@N]
    AS --> GEN[(AiGeneration record)]
```

## 3. Provider interface

```ts
// apps/api/src/modules/ai/provider.ts (proposed)
export interface ChatModelProvider {
  readonly id: 'none' | 'mock' | 'openai-compatible';
  complete(req: {
    system: string;
    user: string;
    jsonSchema?: object;            // used when structured output mode supports it
    maxOutputTokens: number;
    temperature: number;
    signal: AbortSignal;            // timeout and user cancel
  }): Promise<{ text: string; model: string; inputTokens?: number; outputTokens?: number }>;
  health(): Promise<'ok' | 'unconfigured' | 'unreachable'>;
}
```

- **`none`** (default): `health()` returns `unconfigured`, and the analysis endpoint returns `409 AI_DISABLED`.
- **`mock`**: deterministic responses keyed by fixture name. It simulates success, timeout, invalid JSON, schema violations and injection echoes. It is used in CI.
- **`openai-compatible`**: calls `{AI_BASE_URL}/chat/completions`. Many open-weight serving stacks and hosted open-model providers expose this API shape (for example vLLM, llama.cpp server and Ollama's compatibility endpoint). Each concrete endpoint must be verified by the operator. `AI_STRUCTURED_OUTPUT` selects:
  - `json_schema`: `response_format: { type: "json_schema", … }` where the server supports it.
  - `json_object`: `response_format: { type: "json_object" }`.
  - `prompt`: the schema is embedded in the prompt and JSON is extracted from the reply.

New adapters (for example a native SDK for a specific open-model host) implement the same interface and are registered in `ai/providers/index.ts` ([FR-062](../product/requirements.md#community)).

## 4. Structured output schema

`cr-analysis-output@1` (Zod, in `packages/contracts`, because the web displays the suggestion DTO). The prompt text and provider code stay in `apps/api`:

| Field | Type and bounds |
| --- | --- |
| `clarifiedDescription` | string, 1–4,000 |
| `inScope`, `outOfScope` | string[] ≤ 20 items, each ≤ 300 |
| `acceptanceCriteria` | string[] 1–20 items, each ≤ 300 |
| `affectedRequirementKeys` | string[] matching `^REQ-\d+$`, ≤ 50 |
| `dependencies`, `assumptions`, `questionsForClient` | string[] ≤ 20, each ≤ 300 |
| `effortHours` | `{ low, likely, high }` numbers, 0 < low ≤ likely ≤ high ≤ 2,000 |
| `risks` | `{ description ≤ 300, severity: LOW, MEDIUM or HIGH }[]` ≤ 10 |
| `timelineImpact` | string ≤ 500 |

Unknown properties are stripped. Any price-like text is ignored, because the schema has no money fields.

**`cr-analysis-output@2`** (prompt `cr-analysis@2`; kept for existing generation records; [ADR-0022](adr/0022-scope-check-and-members.md)) is `@1` plus:

| Field | Type and bounds |
| --- | --- |
| `effortHours` | as `@1` but 0 ≤ low ≤ likely ≤ high: **extra** effort; `high = 0` maps to **no** estimate (never a zero range, BR-026) and no indicative cost |
| `questionsForClient` | string[] ≤ 10, most important first |
| `scopeAssessment` | `verdict` (`NEW_SCOPE`, `CHANGES_AGREED_SCOPE`, `LIKELY_ALREADY_COVERED` or `UNCLEAR`), `rationale` ≤ 600, `baselineSufficient` boolean, `evidence` ≤ 10 items of `requirementKey`, `relation` (`COVERS`, `CHANGES` or `RELATED`) and `explanation` ≤ 300 |

Under `@2`, the server kept the model's verdict when the cited keys existed and were agreed. Run 4 showed that this cannot detect a confident but wrong "already covered" ([results](../quality/ai-evaluation-results.md#run-4-qwen257b-compared-with-qwen2515b)), so `@3` replaced it.

**`cr-analysis-output@3`** (prompt `cr-analysis@3`, **current**; [ADR-0023](adr/0023-evidence-gated-scope-check.md)) is `@2` with a new `scopeAssessment`:

| Field | Type and bounds |
| --- | --- |
| `scopeAssessment` | `verdict` (reported only, as `modelVerdict`), `rationale` ≤ 600, `baselineSufficient` boolean, `asks` ≤ 10 items of `quote` ≤ 500 (verbatim from the client message) and `citations` ≤ 10 items of `requirementKey`, `relation` (`COVERS`, `CHANGES`, `CONFLICTS` or `RELATED`) and `quote` ≤ 500 (verbatim from that requirement's title, description or one acceptance criterion) |

The prompt lists each requirement as `[agreed]` (baselined) or `[draft]`, with its title, description and acceptance criteria one per line, so quotes come from a single field.

**The server decides coverage and the verdict** (`assessScope` in `apps/api/src/modules/ai/domain/scope-gates.ts`, pure, BR-031). It applies these gates:
- **G1:** a requirement quote must occur verbatim (case- and whitespace-normalised) in one field of that requirement and have ≥ 4 words; otherwise it is discarded.
- **G2:** a requirement that is not agreed becomes `RELATED`.
- **G3:** an ask quote must occur in the message the model saw; otherwise the ask is discarded.
- **G4:** asks must quote ≥ 75% of the message's content words; otherwise coverage cannot be FULL.
- **G5:** a `COVERS` quote must share a content word with its ask; otherwise it becomes `RELATED`.
- **G6:** `CONFLICTS`, or `COVERS` and `CHANGES` from two agreed requirements on one ask, makes the coverage CONFLICT.
- **G7:** FULL only when every ask is covered.

Coverage FULL gives `LIKELY_ALREADY_COVERED`, but only if `baselineSufficient` is true (the asymmetric policy). The other outcomes:
- PARTIAL gives `CHANGES_AGREED_SCOPE` with a verified change, otherwise `UNCLEAR`, naming the uncovered asks.
- NONE gives `NEW_SCOPE`.
- CONFLICT, no agreed requirements, or no grounded ask gives `UNCLEAR`.

`suggestion.scope` returns:
- `verdict` and `modelVerdict`;
- `coverage` and `messageCoverage`;
- `asks`, with their status and verified citations;
- `adjustments`, which explains every discard and downgrade.

The person then confirms the verdict, which is saved on the version and bound by its hash. The [ADR](adr/0023-evidence-gated-scope-check.md#guarantees) lists exactly which guarantees are deterministic and which remain model judgment.

**Post-validation mapping:**
1. Drop `affectedRequirementKeys` not present in the project and emit a warning (ERR-003).
2. Convert hours to minutes, rounded to the nearest minute.
3. Compute the indicative cost range = minutes × resolved rate (BR-021, BR-027).

## 5. Prompt design and versioning

- Prompts live in `apps/api/src/modules/ai/prompts/cr-analysis/v1.ts` and export `{ id: 'cr-analysis@1', system, buildUser(input) }`.
- **Any** change to prompt text or output schema means a new version (`@2`). Old versions are kept while referenced by stored generations or evaluations.
- Generation records store `promptVersion` and `schemaVersion`, which makes outputs reproducible and comparable.
- **System prompt principles:** state the role (scoping assistant for a freelance developer); state that the output is a draft for human review; never price; reference only the listed requirement keys; prefer explicit assumptions and questions over guessing; and treat the client text as data, not instructions.

## 6. Safety, limits and failure handling

| Concern | Control |
| --- | --- |
| Prompt injection | Client text is wrapped in clearly delimited `<client_request>` tags. The system prompt says to treat it as data. Most importantly, the model has **no tools and no write capability**, and output is schema-validated and rendered as escaped text (SEC-009). |
| Input size | `AI_MAX_INPUT_CHARS` (default 12,000). Request text is truncated with a visible notice, and the requirement list is truncated to fit (keys first). |
| Output size | `maxOutputTokens` (default 1,500). |
| Timeout | `AI_TIMEOUT_MS` (default 60,000) via `AbortController`. User cancel is propagated. |
| Retries | `AI_MAX_RETRIES` (default 1) for network/5xx/429 with jittered backoff. One **repair** attempt on invalid JSON (sends the validation errors back). The total time stays under the timeout. |
| Status probes | `GET /ai/status` probes the provider with a 3 s timeout and caches the answer for 30 s per API process (shared by concurrent callers), so an unreachable endpoint does not slow every page load ([ADR-0020](adr/0020-m5-invoice-implementation-choices.md) §10). |
| Rate limits | Per workspace (see [API design](api-design.md#5-rate-limits-initial-values-tune-after-measurement)) and one concurrent analysis per version. |
| Fallback | On any failure the draft is unchanged, a generation is recorded with a failure status, and the UI shows manual-entry guidance (FR-051). |
| Data minimisation | Only CR text, project name and description, and requirement keys, titles, short descriptions, acceptance criteria and agreed/draft status are sent (acceptance criteria since `cr-analysis@3`, disclosed under FR-054). Client contact details, rates and invoices are never sent (SEC-008). |
| Retention | Validated output and metadata are stored. Prompts are stored only if `AI_STORE_PROMPTS=true`. The provider's own retention is outside SoloOps' control and is disclosed on enablement (FR-054, PRV-003). |
| Secrets | `AI_API_KEY` is read from the environment, sent only in the `Authorization` header to `AI_BASE_URL`, and never logged. |

## 7. Evaluation

No model is recommended until it passes this evaluation. **Results:** [AI evaluation results](../quality/ai-evaluation-results.md) — the scope check was evaluated on 2026-10-19 with `qwen2.5:1.5b`, which **fails** the verdict-accuracy threshold. The 2026-10-18 Ollama `qwen2.5:1.5b` run in the [release audit §12](../quality/release-readiness-audit.md#12-release-closure-sprint-2026-10-18) is an **integration smoke test** (8 requests, one prompt), not an evaluation.

- **Dataset:** ≥ 20 synthetic or anonymised change requests across web, mobile and integration work, including vague, multi-part, off-topic and injection-containing requests, each with a project requirement list. It is stored in `apps/api/src/modules/ai/eval/cases/` and contains no real client data.
- **Automatic metrics:** schema-valid rate (first try and after repair), unknown-key rate, effort range sanity (low ≤ likely ≤ high), latency p50/p95, and tokens per request.
- **Human rubric (1–4):** clarity, scope correctness, usefulness of assumptions and questions, and hallucination (invented facts). Two reviewers score each case.
- **Acceptance threshold for a default recommendation:** ≥ 95% schema-valid after repair, zero state-changing behaviour on injection cases (guaranteed by design, verified anyway), and ≥ 70% of cases rated "useful with minor edits" or better (SC-6).
- **Cost and latency:** record the measured cost per 100 analyses for hosted endpoints, using the provider's published pricing on the evaluation date, and the hardware used for self-hosted endpoints.
- **Built for the scope check:** `npm run eval:ai -w @soloops/api` (`apps/api/src/eval-ai.ts`) runs the real AI service against the configured endpoint, 3 times per case, and scores the results against the thresholds in `apps/api/src/modules/ai/eval/score.ts` (fixed before the first run). Datasets: `apps/api/src/modules/ai/eval/scope-cases.json` (`scope-check@1`, 23-case regression set) and `scope-cases-heldout.json` (`scope-check@2`, 32 held-out cases written blind to the gates, committed before them); choose with `EVAL_DATASET=regression|heldout`. The score reports false "already covered" (T4) with counts and the model-alone rate, separately from accuracy (T3), plus "covered" recall. Offline from CI because it needs a real endpoint. The human rubric for proposal text is **not** built yet.

## 8. Candidate models

Candidate open-weight model families can be listed for evaluation (instruction-tuned models that support JSON output). Inclusion in a candidate list is **not** an endorsement. Only measured results in the evaluation file justify a recommendation.
