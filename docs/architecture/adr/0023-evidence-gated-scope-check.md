# ADR-0023: Evidence-gated scope check (server-decided coverage)

- **Status:** Accepted
- **Date:** 2026-10-19
- **Related:** FR-021, FR-054, BR-001–BR-003, BR-008, BR-026, BR-027, BR-031, SEC-008, ADR-0005, ADR-0022
- **Partly supersedes:** ADR-0022 §"Scope check" items 1–2 (the `@2` evidence rules). The members decision in ADR-0022 is unchanged.

## Context
Run 4 of the scope-check evaluation ([ai-evaluation-results.md](../../quality/ai-evaluation-results.md#run-4-qwen257b-compared-with-qwen2515b)) showed that `qwen2.5:7b` said "already covered" wrongly in 14% of runs (threshold ≤ 5%). Each time it cited **real, agreed** requirement keys with free-text explanations. The `@2` server rules check only that a key exists and is agreed, so they could not detect it.

A wrong "already covered" is the costly error: it tells a freelancer that paid work is free. The aim of this decision is to **prevent unsupported claims that work is already included**, not to raise a score.

## Decision

### The model decomposes and cites; the server decides
Prompt `cr-analysis@3`, schema `cr-analysis-output@3`. `@1` and `@2` stay for existing generation records.

1. The model splits the client message into **asks**, each with a **verbatim quote from the message**.
2. For each ask, the model cites agreed requirements with a relation `COVERS | CHANGES | CONFLICTS | RELATED` and a **verbatim quote from that requirement's text**: its title, description or one acceptance criterion. Acceptance criteria are now sent to the model (FR-054 disclosure and the SEC-008 test were updated).
3. The server (`assessScope` in `apps/api/src/modules/ai/domain/scope-gates.ts`, pure) applies gates G1–G7 and computes **coverage = FULL | PARTIAL | NONE | CONFLICT** from verified evidence only:

| Gate | Rule | On failure |
| --- | --- | --- |
| G1 Quote verification | The requirement quote occurs verbatim, case- and whitespace-normalised (typographic quotes and dashes folded, edge punctuation ignored), inside **one** field of that requirement's frozen text, and has ≥ **4** words. | The citation is discarded. |
| G2 Agreed only | The requirement is baselined (BR-004: its text is frozen). | The relation becomes `RELATED`. |
| G3 Ask grounding | The ask quote occurs verbatim (same normalisation) in the client message **as sent to the model**. | The ask is discarded. |
| G4 Nothing dropped | Ask quotes together contain ≥ **75%** of the message's content words (words not in the stop-word list). | Coverage cannot be FULL. |
| G5 Topic overlap | A `COVERS` quote shares ≥ 1 content word with its ask (light plural stemming: `-ies`→`-y`, trailing `s`). | The relation becomes `RELATED`. |
| G6 Conflicts | Any verified `CONFLICTS`, or `COVERS` from one agreed requirement and `CHANGES` from another on the same ask. | The ask, and the coverage, is CONFLICT. |
| G7 Full coverage | Every ask has ≥ 1 verified `COVERS` and none has `CHANGES` or `CONFLICTS`. | Coverage is PARTIAL or NONE. |

Invented keys are removed. Duplicate asks and citations are collapsed.

**Fixed before evaluation.** X = 75% and the stop-word list (English function words plus request filler such as "please", "make sure", "confirm", "need") were set in code before any `@3` run. Domain words such as "customer" or "payment" are deliberately not stop words.

### Final verdict (server-decided)
| Coverage | Verdict |
| --- | --- |
| FULL, and the model said `baselineSufficient` | `LIKELY_ALREADY_COVERED` |
| FULL, but the model said the baseline is insufficient | `UNCLEAR` |
| PARTIAL with a verified `CHANGES` citation | `CHANGES_AGREED_SCOPE` |
| PARTIAL otherwise | `UNCLEAR`, listing the uncovered asks |
| NONE | `NEW_SCOPE` |
| CONFLICT | `UNCLEAR` |
| No agreed requirements, or no grounded ask | `UNCLEAR` (safe extension: nothing to compare with) |

The model's verdict is returned as `modelVerdict`, and `adjustments` explains every discard and every downgrade. **The model's verdict never establishes coverage.**

### Asymmetric policy (decided before evaluation)
Only "already covered" needs full proof, so `baselineSufficient` gates only `LIKELY_ALREADY_COVERED`. New scope and changes always go through a priced proposal and a client approval, so a wrong "new scope" costs a conversation, not unpaid work.

### UI
The scope check shows each ask with its quote and status in words ("In the agreed scope", "Not in the agreed scope", "Changes the agreed scope", "Conflicting agreed requirements"), and each proof as "Covered by REQ-2 Title: '…'". The coverage result is a sentence, never colour alone. The "SoloOps changed the AI's verdict" notice stays.

### Unchanged
The person-confirmed `scopeVerdict` on the version, the version hash rules, approvals, billing, members and every workflow. No migration was needed: AI suggestions are not persisted beyond the raw validated output in `aiGenerations`.

## Guarantees

**Deterministic (enforced by pure code, unit-tested including a 2,000-answer randomised invariant test):**
- A model verdict alone never yields "already covered".
- Every piece of covering evidence is a real verbatim quote of ≥ 4 words from **one** field of a **frozen, agreed** requirement of this project.
- Invented keys, draft requirements, fabricated or stitched quotes, quotes of another requirement, quotes the client wrote, and trivial quotes never count as covering.
- "Already covered" needs every grounded ask to be covered, ≥ 75% of the message's content words to be quoted, and no change or conflict.
- Unsupported or contradictory evidence gives `UNCLEAR`, and the reason is shown.
- A person always confirms the verdict before it is proposed (BR-008, unchanged).

**Still model judgment (not guaranteed):**
- **Decomposition.** G4 only limits omissions: up to 25% of content words can be left unquoted, and the model may split a request badly.
- **Meaning.** Whether a quote truly means the same as the ask. G5 is lexical: a quote that shares one word but means something else can still "cover" an ask. A client who quotes a real requirement verbatim (as in held-out case H25) passes G1 and G5.
- **Conflicts the model does not flag.** The server finds conflicts only from the model's citations.
- **Paraphrases.** Coverage written in different words may become PARTIAL, `UNCLEAR` or even `NEW_SCOPE` (when G5 finds no shared word, e.g. "mail" for "email", the only covering citation becomes related). Seen in the 2026-10-19 browser demo with `qwen2.5:7b`. That is safe (it becomes a priced proposal that a person can correct), but less useful.

## Consequences
- The costly error now needs the model to quote real, agreed requirement text that is on the same topic as a real part of the message, for (nearly) the whole message.
- Fewer requests reach "already covered", so "covered" recall may fall. That trade-off is accepted and measured.
- The gate constants are product policy: changing them needs new held-out cases and a new evaluation.

## Alternatives rejected
- **Tuning the `@2` prompt or thresholds:** a post-hoc fit to the same 23 cases.
- **A larger model:** run 4 showed better judgment but a worse safety result; it cannot be verified.
- **Embedding similarity for G5:** a new dependency, and still a judgment, not a proof.
