---
name: soloops-ai-engineering
description: Rules and procedure for SoloOps AI model integration — provider adapters, versioned prompts and schemas, structured-output validation, timeouts/retries, injection safety, evaluation, and keeping AI advisory-only. Use when touching apps/api/src/modules/ai, prompts, AI output handling, AI-related UI, provider configuration, or model selection.
---

# SoloOps AI engineering

## Purpose
Use open-weight models through a provider-independent, safe, measurable integration where **AI suggests and humans decide**.

## When to use
- Adding or changing a provider adapter, prompt, output schema, or AI-facing UI.
- Choosing or recommending a model.
- Debugging AI failures.

## Required inputs
The change description and the AI feature affected (currently only `cr-analysis`).

## Procedure
1. Read [ai-architecture.md](../../../docs/architecture/ai-architecture.md) and [ADR-0005](../../../docs/architecture/adr/0005-ai-provider-abstraction.md), and BR-001…003, BR-026, BR-027.
2. **Keep the boundary.**
   - The `ai` module returns data only and never imports scope-guard, billing or core-ops.
   - No tool calling and no write paths.
   - No money fields in output schemas. Cost is computed by the app.
3. **Version everything.**
   - Any prompt text or schema change means a new `@N`.
   - Keep old versions while referenced.
   - Record `promptVersion` and `schemaVersion` on each `AiGeneration`.
4. **Validate the output.**
   - Use a Zod schema with bounds. Strip unknown keys.
   - One repair retry on invalid JSON.
   - Drop unknown requirement keys and warn.
   - Never apply partial output to drafts automatically.
5. **Bound the call.**
   - `AbortController` timeout, at most `AI_MAX_RETRIES` with jitter.
   - Input truncation with a notice, and an output token cap.
   - Per-workspace rate limit and one concurrent call per version.
6. **Protect data.**
   - Send only the minimised fields.
   - Wrap client text in delimiters and treat it as data.
   - Never log keys or raw client text.
   - AI is enabled only after owner opt-in.
7. **Fail gracefully.** The draft stays unchanged, the failure status is recorded, and the UI explains that the user can continue manually.
8. **Test.**
   - Use the `mock` provider fixtures for success, timeout, invalid JSON, schema violations, unknown keys and injection text.
   - CI never calls a real endpoint.
9. **Evaluate before recommending.**
   - Run the evaluation set (≥ 20 cases): schema-valid rate, unknown-key rate, latency p50/p95, tokens and cost, and the human rubric.
   - Record results with the date, endpoint, model and hardware or pricing source.
   - **Never claim a model is suitable or better without these recorded results.**

## Output
The adapter, prompt or schema change with tests, an updated AI architecture doc, and evaluation results if the model choice changed.

## Quality checklist
- [ ] No AI path can change entity state, prices or invoices.
- [ ] The schema is versioned, bounded and validated, and has no money fields.
- [ ] Timeouts, retries, rate limits and truncation are in place.
- [ ] The payload is minimised. Secrets are redacted.
- [ ] Mock-based tests cover the failure modes.
- [ ] Model claims are backed by recorded evaluation.
