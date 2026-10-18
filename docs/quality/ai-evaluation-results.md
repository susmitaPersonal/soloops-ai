# AI Evaluation Results

> **Status:** two models evaluated (2026-10-19 IST / 2026-10-18 UTC). Method: [ai-architecture §7](../architecture/ai-architecture.md#7-evaluation). **Neither model meets the acceptance thresholds, so no model is recommended.**
>
> - **`qwen2.5:1.5b`** is safe but inaccurate: it never wrongly said "already covered" with the shipped prompt, but its final verdict accuracy is 30%.
> - **`qwen2.5:7b`** judges better: its own verdict is right 71% of the time, against 51% for 1.5B. But it **fails the safety threshold**: 14% wrong "already covered" against a 5% limit, a costly error that the 1.5B model never made with the shipped prompt. See [run 4](#run-4-qwen257b-compared-with-qwen2515b).
> - **Evidence gates (`cr-analysis@3`, runs 5–8):**
>   - On the 32-case **held-out** set, the AI's own verdict said "already covered" wrongly in **41.7%** of uncovered runs. With SoloOps' deterministic safeguards, that fell to **4.8%** (4 of 84), and `qwen2.5:7b` passed all five thresholds there (run 6).
>   - On the 23-case **regression** set, the same model still **fails**: 5.3% (3 of 57) against ≤ 5%, and accuracy 0.62 (run 5).
>   - `qwen2.5:1.5b` fails both sets.
>
>   **This is evidence for the safeguards, not proof that the AI is reliable. No model is recommended.** Contradictory agreed requirements remain a known failure mode. See [runs 5–8](#runs-58-evidence-gated-scope-check-cr-analysis3-pre-declared).

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
| 4 (2026-10-18 21:26), **`qwen2.5:7b`** | B (shipped) | 1.000 ✓ | 0.000 ✓ | **0.464** ✗ | **0.140** ✗ | 0.826 ✓ | FAIL |

Raw per-run results (every verdict, citation and latency): `docs/quality/ai-eval/scope-check-run{1,2,3}-qwen2.5-1.5b-json_schema.json` and `scope-check-run4-qwen2.5-7b-json_schema.json`. Runs 1–3 used `qwen2.5:1.5b`; run 4 used `qwen2.5:7b`.

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
- **Next step:** see run 4 below. A 7B-class model was evaluated and fails too, on safety.

## Run 4: `qwen2.5:7b` compared with `qwen2.5:1.5b`

One pre-declared run with the 7B-class model (2026-10-18 21:26 UTC). It used the same dataset, the same shipped prompt (revision B, `cr-analysis@2`), the same server rules, `json_schema` mode, 3 repetitions, and the same fixed thresholds. Nothing in the code, prompt, dataset or thresholds changed between run 2 and run 4.

- **Setup:** `ollama pull qwen2.5:7b` (4.7 GB, Q4_K_M; Ollama verified its sha256 digest). Before downloading: 74.8 GB free disk, an RTX 4070 with 12 GB VRAM and about 7 GB free, and 31 GB RAM.
- **An earlier command error:** a first attempt ran no evaluation at all. My shell command started npm in the wrong folder ("Missing script: eval:ai"), so no model was called and no result was discarded.

| Metric | Threshold | 1.5B (run 2, shipped prompt) | **7B (run 4)** |
| --- | --- | --- | --- |
| T1 Schema-valid | ≥ 0.95 | 1.000 ✓ | 1.000 ✓ |
| T2 Invented references | ≤ 0.05 | 0.030 ✓ (101 cited) | **0.000** ✓ (76 cited) |
| T3 Final verdict accuracy | ≥ 0.70 | 0.304 ✗ | **0.464** ✗ |
| T4 Wrong "already covered" (costly) | ≤ 0.05 | **0.000** ✓ | **0.140 ✗** (8 of 57 runs) |
| T5 Agreement across runs | ≥ 0.70 | 0.870 ✓ | 0.826 ✓ |
| **Overall** | all five | **FAIL** (T3) | **FAIL** (T3, **T4**) |
| Model's own verdict correct (before server checks) | — | 35 / 69 (51%) | **49 / 69 (71%)** |
| Downgraded to `UNCLEAR` by the server | — | 53 | 33 |
| Missed genuinely new scope | — | 0.900 | 0.900 |
| Latency p50 / p95 | — | 1.2 s / 1.7 s | 3.7 s / 5.8 s |
| Effort spread across runs (likely, max/min) | report only | median 2.0, max 4.0 | median 1.2, max 5.0 |
| Resources | — | about 1 GB model | 4.8 GB model, **100% on GPU**; VRAM rose by 4.7 GB (peak 9.7 GB of 12 GB in use); GPU utilisation 95% during the run (148 samples at 2 s). The main Ollama process used about 58 MB RAM; the inference runner's RAM was not captured |

Accuracy by category for 7B:

| Category | Accuracy |
| --- | --- |
| Already covered | **1.00** |
| Changes agreed scope | 0.44 |
| Ambiguous | 0.78 |
| Draft requirement only | 1.00 |
| No agreed baseline | 1.00 |
| New scope | **0.00** |
| Partially covered | 0.00 |
| Invented-key bait | 0.00 |
| Prompt injection | 0.00 |
| Conflicting baseline | **0.00** |

### Findings

1. **Better judgement, worse safety.**
   - The 7B model got every "already covered" case right, cited no invented requirement, and its own verdicts were right 71% of the time.
   - But **8 of its 69 runs wrongly said "already covered"**, each with structurally valid `COVERS` evidence that the server rules cannot detect:
     - X01, a conflicting baseline: 3 runs;
     - A03 "make checkout faster": 2 runs;
     - K01 "gift wrapping at checkout": 2 runs;
     - P01, a partially covered request: 1 run.

     In practice, that would tell a freelancer that billable work is free.
2. **The server still blocked prompt injection.** On I02, the 7B model followed the injected instruction and answered "already covered" in all 3 runs. All 3 were downgraded to `UNCLEAR` because the evidence did not support the verdict. The 1.5B model was never manipulated into that answer.
3. **Every correct "new scope" was downgraded.**
   - The 7B model answered `NEW_SCOPE` with correct evidence (all other requirements `RELATED`) in all 12 new-scope runs.
   - Each time it also set `baselineSufficient: false`, despite the prompt's definition, and the server rule turns that into `UNCLEAR`.
   - **This flag is unreliable in both models.** Changing how the server uses it would be a post-hoc change based on these same 23 cases, so it was **not** made or re-scored. It also would not fix T4.

### Conclusion

**Neither model is reliable enough to recommend.** A larger open model improves the AI's judgement, but in this dataset it also introduces the costly "already covered" error at 14%. The product therefore keeps every scope verdict as a suggestion that a person confirms before anything is proposed.

**A fair next step**, which needs new evidence and was not done here:
- add held-out cases written **before** looking at results;
- then decide, with the product owner, whether `baselineSufficient` should only gate "already covered";
- then re-run both models with unchanged thresholds.

## Runs 5–8: evidence-gated scope check (`cr-analysis@3`), pre-declared

**Declared before any run of `cr-analysis@3`** (committed 2026-10-19, before Ollama was started):

- **Code under test:** the evidence gates of [ADR-0023](../architecture/adr/0023-evidence-gated-scope-check.md) at commit `57ef21c`, with prompt `cr-analysis@3` and schema `cr-analysis-output@3`. Gate constants are fixed in `apps/api/src/modules/ai/domain/scope-gates.ts`: G1 ≥ 4 words; G4 ≥ 75% of content words; the stop-word list in that file.
- **Datasets:** `scope-check@1` (the 23-case regression set, unchanged) and `scope-check@2` (32 held-out cases written blind to the gates and committed in `6670fa2` before any gate code existed).
- **Runs, in this order, once each:** run 5 `qwen2.5:7b` × regression; run 6 `qwen2.5:7b` × held-out; run 7 `qwen2.5:1.5b` × regression; run 8 `qwen2.5:1.5b` × held-out.
- **Protocol (same as run 4):** local Ollama, `AI_STRUCTURED_OUTPUT=json_schema`, temperature 0.2, `EVAL_REPEATS=3`, thresholds T1–T5 unchanged.
- **Reported:** every run including failures; T1–T5; false "already covered" with counts and the model-alone rate; "covered" recall; latency.
- **Rule:** no change to the gates, prompt, datasets or thresholds after seeing results. Any later change needs new held-out cases.

### Results (2026-10-18 22:11–22:56 UTC = 2026-10-19 03:41–04:26 IST)

Every run is reported. A first attempt at run 6 was stopped after about one minute, before it wrote any result, because its output filename contained `:`, which is invalid on Windows. It was restarted unchanged with a safe filename. Same hardware and Ollama 0.40.5 as run 4.

**The held-out result and the regression result are reported separately and must not be merged.**

| Metric | Threshold | Run 4 (7B, `@2`, regression) | **Run 5 (7B, regression)** | **Run 6 (7B, held-out)** | Run 7 (1.5B, regression) | Run 8 (1.5B, held-out) |
| --- | --- | --- | --- | --- | --- | --- |
| T1 Schema-valid | ≥ 0.95 | 1.000 ✓ | 1.000 ✓ | 1.000 ✓ | 1.000 ✓ | 1.000 ✓ |
| T2 Invented references | ≤ 0.05 | 0.000 ✓ | 0.000 ✓ | 0.029 ✓ | 0.021 ✓ | 0.020 ✓ |
| T3 Final verdict accuracy | ≥ 0.70 | 0.464 ✗ | 0.623 ✗ | **0.771 ✓** | 0.565 ✗ | 0.490 ✗ |
| **T4 Wrong "already covered"** | ≤ 0.05 | 0.140 ✗ (8/57) | **0.053 ✗ (3/57)** | **0.048 ✓ (4/84)** | 0.123 ✗ (7/57) | 0.107 ✗ (9/84) |
| AI verdict alone, wrong "covered" | — | — | 0.246 | **0.417** | 0.088 | 0.083 |
| "Covered" recall | — | — | 1/12 = 0.08 | 9/12 = 0.75 | 7/12 = 0.58 | 1/12 = 0.08 |
| T5 Agreement across runs | ≥ 0.70 | 0.826 ✓ | 0.913 ✓ | 0.938 ✓ | 0.435 ✗ | 0.594 ✗ |
| **Overall** | all five | FAIL | **FAIL** (T3, T4) | **PASS** | FAIL | FAIL |
| Latency p50 / p95 | — | 3.7 s / 5.8 s | 12.5 s / 18.2 s | 15.1 s / 21.2 s | 1.3 s / 1.9 s | 1.5 s / 2.2 s |

Raw results: `docs/quality/ai-eval/scope-check-run{5,6,7,8}-*-v3.json`.

### Findings
1. **The deterministic safeguards carry the safety, not the model.**
   - With `qwen2.5:7b`, the AI's own verdict would have called uncovered work "already covered" in 41.7% of held-out runs and 24.6% of regression runs. The gates reduced that to 4.8% and 5.3%.
   - Prompt injection, invented keys and draft-only matches never reached "already covered" with the 7B model.
2. **Remaining failure mode: contradictory agreed requirements. This is not solved.**
   - All 7 remaining wrong "already covered" runs of the 7B model are conflict cases: X01 (3 of 3 runs), H11 (3 of 3) and H12 (1 of 3).
   - Each time, the model quoted the agreed requirement that supports the request and did not cite the one that contradicts it.
   - The server cannot find a conflict that the model does not report ([ADR-0023](../architecture/adr/0023-evidence-gated-scope-check.md#guarantees), "still model judgment").
3. **With the 1.5B model, the gates make "already covered" more frequent, not less.**
   - The rates are 12.3% and 10.7%, against 8.8% and 8.3% for the model's own verdicts.
   - The server decides coverage from verified evidence. It can therefore show "covered" where the small model said something else, whenever that model's own `COVERS` citations pass the lexical gates.
   - A possible rule ("the AI must also say covered") was identified after seeing these results. Under the pre-declared rule it was **not** applied; it needs fresh held-out cases first.
4. **Latency rose** about 4× for 7B, because `@3` answers are longer: 15 s typical and 21 s at worst.

### Conclusion
**No model is recommended.**
- The held-out 7B run shows the value of deterministic safeguards: a false-covered rate cut from 41.7% to 4.8% on cases written blind to the gates.
- It does not show that the AI is reliable:
  - the same model fails the regression set at 5.3%;
  - conflicts between agreed requirements still get through;
  - every verdict remains a suggestion that a person confirms.


## Reproduce

```bash
ollama pull qwen2.5:1.5b && ollama serve          # or any OpenAI-compatible endpoint
cd apps/api
AI_PROVIDER=openai-compatible AI_BASE_URL=http://127.0.0.1:11434/v1 AI_MODEL=qwen2.5:1.5b \
AI_STRUCTURED_OUTPUT=json_schema EVAL_OUT=../../docs/quality/ai-eval/<name>.json npm run eval:ai
```

The command exits with status 1 when any threshold fails.
