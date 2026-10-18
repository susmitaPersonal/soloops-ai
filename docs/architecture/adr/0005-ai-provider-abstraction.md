# ADR-0005: Provider-independent AI integration

- **Status:** Accepted
- **Date:** 2026-10-16
- **Related:** FR-021, FR-050–054, BR-001–003, BR-027, SEC-008, SEC-009

## Context
The project must use open-weight models, must not depend on a proprietary paid API, and must avoid vendor lock-in. The first release targets a configurable hosted endpoint, with local or private deployment later. AI output must never be authoritative.

## Decision
1. Define a `ChatModelProvider` port with `none` (default), `mock` and `openai-compatible` adapters ([AI architecture](../ai-architecture.md#3-provider-interface)).
2. The AI module exposes one use case, `analyzeChangeRequest`, behind an `AnalyzerPort` consumed by scope-guard. The AI module has **no dependency on and no write access to** domain modules.
3. Output is structured JSON validated by a versioned Zod schema. The schema contains **no money fields**: cost is computed by the app from human-confirmed hours.
4. Prompts and schemas are versioned (`cr-analysis@N`), and every generation records its versions, provider, model and outcome.
5. AI is opt-in per workspace with a data-sharing disclosure.

## Alternatives considered
- **Hard-code one hosted provider's SDK:** fastest, but creates lock-in and conflicts with the open-model goal.
- **Agent framework with tool calling:** more capable, but tool access would let injected instructions trigger actions. This contradicts BR-002 and is unnecessary for a single structured-extraction task.
- **Let the model suggest prices:** rejected, because prices must be deterministic and auditable (ADR-0007).

## Rationale
The OpenAI-compatible chat API shape is widely implemented by open-weight serving stacks and hosted open-model services, so one adapter covers many deployments. Operators still verify their specific endpoint. A tool-less, schema-validated design makes the advisory-only guarantee structural rather than a matter of prompt wording.

## Consequences
- Provider-specific features (for example native JSON-schema modes) are toggled by config (`AI_STRUCTURED_OUTPUT`). Fallback to prompt-based JSON plus a repair retry.
- Model choice requires the documented evaluation. No default model is shipped.

## Security and operational implications
Client text leaves the deployment when a hosted endpoint is used, so it is disclosed and minimised. API keys are environment-only and redacted. Timeouts, retries and rate limits bound cost and latency. CI uses only the mock provider.
