import {
  ProviderError,
  type ChatModelProvider,
  type CompletionRequest,
  type CompletionResult,
} from './types';

/**
 * Deterministic test provider (ai-architecture.md §3). Refused in production by config. A
 * scenario is chosen by a `[mock:<name>]` tag in the client text, so E2E tests can exercise
 * failure paths through the real API; without a tag it answers with a valid suggestion that
 * references the first requirement key it finds in the prompt, quoting the client message and
 * that requirement's text so the evidence gates can verify it (ADR-0023).
 *
 * Scenarios: success (default), timeout, invalid-json, invalid-then-valid, schema-violation,
 * unknown-keys, server-error, rate-limited, auth-failed, oversized, price-text.
 */
export const MOCK_MODEL = 'mock-fixtures@1';

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new ProviderError('TIMEOUT'));
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new ProviderError('TIMEOUT'));
      },
      { once: true },
    );
  });
}

/** Quotes a mock answer can use: one from the client message, one from a requirement's text. */
export interface MockQuotes {
  ask?: string;
  requirement?: string;
}

export function validSuggestion(
  requirementKey: string | null,
  extra: Record<string, unknown> = {},
  quotes: MockQuotes = {},
) {
  const ask = quotes.ask ?? 'Add phone-number login using a one-time password';
  return {
    clarifiedDescription:
      'Add phone-number login using a one-time password delivered via WhatsApp, alongside the existing email login.',
    inScope: ['OTP request and verification endpoints', 'Login screen option'],
    outOfScope: ['SMS fallback'],
    acceptanceCriteria: ['User receives the OTP within 30 s', 'OTP expires after 5 min'],
    affectedRequirementKeys: requirementKey ? [requirementKey] : [],
    dependencies: ['Client provides a WhatsApp Business API account'],
    assumptions: ['Existing users have a verified phone number'],
    effortHours: { low: 6, likely: 8, high: 14 },
    risks: [{ description: 'Provider approval may take several days', severity: 'MEDIUM' }],
    timelineImpact: 'Likely 2–4 working days',
    questionsForClient: ['Should email login remain available?'],
    scopeAssessment: requirementKey
      ? {
          verdict: 'CHANGES_AGREED_SCOPE',
          rationale: `The request extends the login described in ${requirementKey}.`,
          baselineSufficient: true,
          asks: [
            {
              quote: ask,
              citations: quotes.requirement
                ? [{ requirementKey, relation: 'CHANGES', quote: quotes.requirement }]
                : [],
            },
          ],
        }
      : {
          verdict: 'NEW_SCOPE',
          rationale: 'No recorded requirement describes this request.',
          baselineSufficient: true,
          asks: [{ quote: ask, citations: [] }],
        },
    ...extra,
  };
}

/**
 * Reads quotes from a `cr-analysis@3` prompt the way a careful model would: the client message
 * verbatim, and the first line of the first requirement that has at least 4 words.
 */
function quotesFromPrompt(user: string): MockQuotes {
  const ask = /<client_request>\n([\s\S]*?)\n<\/client_request>/.exec(user)?.[1]?.split('\n')[0];
  const block = /<requirements>\n([\s\S]*?)\n<\/requirements>/.exec(user)?.[1] ?? '';
  const first = block.split(/\n(?=- REQ-)/)[0] ?? '';
  const requirement = first
    .split('\n')
    .slice(1)
    .map((l) => l.replace(/^\s*(Title:|Description:|\*)\s*/, '').trim())
    .find((l) => l !== 'Acceptance criteria:' && l.split(/\s+/).length >= 4);
  return {
    ...(ask ? { ask: ask.trim().slice(0, 500) } : {}),
    ...(requirement ? { requirement: requirement.split(/\s+/).slice(0, 8).join(' ') } : {}),
  };
}

export function createMockProvider(): ChatModelProvider {
  return {
    id: 'mock',
    model: MOCK_MODEL,
    async health() {
      return 'ok';
    },
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const scenario = /\[mock:([a-z-]+)\]/.exec(req.user)?.[1] ?? 'success';
      const key = /\bREQ-\d+\b/.exec(req.user)?.[0] ?? null;
      const ok = (body: unknown): CompletionResult => ({
        text: JSON.stringify(body),
        model: MOCK_MODEL,
        inputTokens: Math.ceil((req.system.length + req.user.length) / 4),
        outputTokens: 200,
      });
      const quotes = quotesFromPrompt(req.user);
      switch (scenario) {
        case 'timeout':
          await wait(10 * 60 * 1000, req.signal);
          throw new ProviderError('TIMEOUT');
        case 'invalid-json':
          return { text: 'Sure! Here is the analysis: {not json', model: MOCK_MODEL };
        case 'invalid-then-valid':
          // The first call is invalid; the repair call (which quotes the validation errors) is
          // valid, exercising the single repair attempt (ai-architecture §6).
          return /validation errors/i.test(req.user)
            ? ok(validSuggestion(key, {}, quotes))
            : { text: '```oops', model: MOCK_MODEL };
        case 'schema-violation':
          return ok(
            validSuggestion(key, {
              effortHours: { low: 10, likely: 5, high: 1 },
              acceptanceCriteria: [],
            }),
          );
        case 'unknown-keys':
          return ok(
            validSuggestion(key, { affectedRequirementKeys: [key ?? 'REQ-1', 'REQ-999'] }, quotes),
          );
        case 'price-text':
          return ok(
            validSuggestion(key, { price: '₹99,99,999', totalCost: 1e9, approve: true }, quotes),
          );
        case 'oversized':
          return { text: 'x'.repeat(200_000), model: MOCK_MODEL };
        case 'server-error':
          throw new ProviderError('SERVER_ERROR', 'status 503');
        case 'rate-limited':
          throw new ProviderError('RATE_LIMITED', 'rate limited');
        case 'auth-failed':
          throw new ProviderError('AUTH_FAILED');
        default:
          return ok(validSuggestion(key, {}, quotes));
      }
    },
  };
}
