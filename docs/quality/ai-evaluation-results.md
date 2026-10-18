# AI Evaluation Results

> **Status:** the first recorded evaluation (2026-10-19 IST / 2026-10-18 UTC). Method: [ai-architecture §7](../architecture/ai-architecture.md#7-evaluation). **Result: the only model evaluated, `qwen2.5:1.5b`, does NOT meet the verdict-accuracy threshold.** The scope check is safe with it, because unsupported verdicts become `UNCLEAR` and it never wrongly said "already covered" with the shipped prompt. But it is not accurate, so **no model is recommended**.

## What is evaluated

The scope check of `cr-analysis@2` (FR-021): for a client request and the project's requirements, the model returns a verdict (`NEW_SCOPE`, `CHANGES_AGREED_SCOPE`, `LIKELY_ALREADY_COVERED`, `UNCLEAR`) with evidence. The **server** then keeps only evidence that cites real, agreed requirements and downgrades unsupported or contradictory verdicts to `UNCLEAR` (`assessScope`, ai-architecture §4). Accuracy is measured on the **final** verdict, which is what users see.

## Method

| Item | Value |
| --- | --- |
| Dataset | `scope-check@1`, 23 synthetic cases in `apps/api/src/modules/ai/eval/scope-cases.json`. Categories: already covered (4), new scope (4), changes agreed scope (3), partially covered (2), ambiguous (3), only a draft requirement matches (1), invented-key bait (1), prompt injection (2), no agreed baseline (2), conflicting baseline (1). Expected verdicts are known by construction; no real client data |
| Runner | `npm run eval:ai -w @soloops/api` (`apps/api/src/eval-ai.ts`): the real AI service (prompt, `openai-compatible` adapter, validation, one repair, server scope check) with a throwaway in-memory MongoDB. Opt-in, never in CI |
| Repetitions | 3 per case (69 analyses per run) |
| Endpoint | Ollama 0.40.5, local, `http://127.0.0.1:11434/v1`, `AI_STRUCTURED_OUTPUT=json_schema`, temperature 0.2 |
| Hardware | AMD Ryzen 9 7900X (12 cores), 31 GB RAM, NVIDIA GeForce RTX 4070; Windows 11 |
| Scoring | `apps/api/src/modules/ai/eval/score.ts` (unit-tested, `score.test.ts`) |

### Thresholds (fixed in code before the first run; never changed)

| ID | Metric | Threshold |
| --- | --- | --- |
| T1 | Schema-valid answers (after the one repair attempt) | ≥ 0.95 |
| T2 | Invented requirement references among the model's raw citations | ≤ 0.05 |
| T3 | Final verdict within the case's expected set | ≥ 0.70 |
| T4 | Wrong "already covered" (the costly error: unbilled work) | ≤ 0.05 |
| T5 | Cases whose 3 runs give the same final verdict | ≥ 0.70 |

Effort-estimate spread and latency are **reported only**. Consistent estimates would not prove accurate ones.

## Results

| Run (date, UTC) | Prompt revision | T1 | T2 | T3 | T4 | T5 | Overall |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 (2026-10-18 20:47) | A: first draft of `@2` | **0.667** ✗ | 0.035 ✓ | **0.246** ✗ | 0.000 ✓ | **0.478** ✗ | FAIL |
| 2 (2026-10-18 20:54) | **B: shipped** | 1.000 ✓ | 0.030 ✓ | **0.304** ✗ | 0.000 ✓ | 0.870 ✓ | FAIL (T3) |
| 3 (2026-10-18 20:56) | C: B plus a worked example (reverted) | 1.000 ✓ | 0.041 ✓ | **0.377** ✗ | 0.018 ✓ | **0.652** ✗ | FAIL |

Raw per-run results (every verdict, citation and latency): `docs/quality/ai-eval/scope-check-run{1,2,3}-qwen2.5-1.5b-json_schema.json`.

| Run | Model verdict correct before server checks | Downgraded to `UNCLEAR` by the server | Wrong "new scope" | Missed genuinely new scope | p50 / p95 latency | Effort spread across runs (likely, max/min) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 26 / 69 | 39 | 0.000 | 0.933 | 2.3 s / 4.0 s | median 1.0, max 10 |
| 2 | 35 / 69 | 53 | 0.000 | 0.900 | 1.2 s / 1.7 s | median 2.0, max 4.0 |
| 3 | 26 / 69 | 14 | 0.014 | 0.833 | 1.1 s / 1.7 s | not measurable (most runs estimated no extra effort) |

**Accuracy by category, run 2 (shipped prompt):**

| Category | Accuracy |
| --- | --- |
| Already covered | 0.08 |
| New scope | 0.00 |
| Changes agreed scope | 0.00 |
| Partially covered | 0.00 |
| Ambiguous | 0.89 |
| Draft requirement only | 1.00 |
| Invented-key bait | 0.00 |
| Prompt injection | 0.00 |
| No agreed baseline | 1.00 |
| Conflicting baseline | 1.00 |

The 1.00 categories are mostly the **server's safety net** (no agreed requirement means `UNCLEAR`), not model skill.

## What changed between runs, and why

1. **Run 1 → revision B.** Diagnosis of the raw outputs found two problems:
   - 23 of 69 answers were invalid because the model answered `effortHours.low: 0` for already-covered work, which is a sensible answer that the schema refused. Zero extra effort is now valid in the model's output and is mapped to **no estimate** (a person never sees a zero range, BR-026).
   - The model set `baselineSufficient: false` even when it correctly said "new scope". The prompt now defines that flag precisely.

   Thresholds were not touched.
2. **Run 2 → run 3.** Diagnosis showed that the model labels almost every cited requirement as `COVERS`, even when its own verdict is "new scope" or "changes agreed scope". The server correctly refuses such contradictory evidence: you specified that contradictory or invalid evidence must give `UNCLEAR`, so the rule was **not** relaxed. A worked example in the prompt (revision C) raised accuracy slightly but lowered agreement and produced one wrong "already covered" (case P01, a partially covered request), so it was **reverted**. Revision B ships because it measured safest: T4 = 0 and the best agreement. Iteration stopped there to avoid overfitting 23 cases.

## Conclusions

- **Demonstrated:**
  - The integration works with a free, local open-weight model: 100% schema-valid with revision B, at about 1–2 s per analysis on the hardware above.
  - Invented references are rare (3%) and are removed by the server.
  - Prompt-injection attempts never produced an accepted "already covered" verdict in any run (every injection run ended `UNCLEAR` or as a rejected invalid answer).
  - The server's evidence rules turn unreliable answers into `UNCLEAR` instead of a wrong verdict.
- **Not demonstrated:**
  - That `qwen2.5:1.5b` classifies scope accurately. It does not: 30% final accuracy against a 70% threshold, and its own verdicts were right only about half of the time.
  - Effort-estimate accuracy. The likely effort for identical requests varied up to 4× (run 2) and 10× (run 1).
  - Anything about other models. None has been evaluated.
- **Product consequence:** with this model, most scope checks end as `UNCLEAR` with the questions to ask. The human always decides the verdict and confirms it before proposing.
- **Next step:** evaluate a larger open-weight model (for example a 7B-class instruction model) with the same dataset, thresholds and command, after the maintainer approves the download. Then record the results here. A larger model must pass every threshold before it is recommended.

## Reproduce

```bash
ollama pull qwen2.5:1.5b && ollama serve          # or any OpenAI-compatible endpoint
cd apps/api
AI_PROVIDER=openai-compatible AI_BASE_URL=http://127.0.0.1:11434/v1 AI_MODEL=qwen2.5:1.5b \
AI_STRUCTURED_OUTPUT=json_schema EVAL_OUT=../../docs/quality/ai-eval/<name>.json npm run eval:ai
```

The command exits with status 1 when any threshold fails.
