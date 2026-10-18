import type { AiProviderId } from '@soloops/contracts';

/** One chat completion request (ai-architecture.md §3). No tools, no functions: text in, text out. */
export interface CompletionRequest {
  system: string;
  user: string;
  /** Used only when the endpoint supports structured output (`AI_STRUCTURED_OUTPUT`). */
  jsonSchema?: object;
  maxOutputTokens: number;
  temperature: number;
  signal: AbortSignal;
}

export interface CompletionResult {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export type ProviderHealth = 'ok' | 'unconfigured' | 'unreachable';

/** Provider port (ADR-0005). Adapters never see workspace data beyond the two prompt strings. */
export interface ChatModelProvider {
  readonly id: AiProviderId;
  /** Model identifier as configured (shown in status and stored on generations). */
  readonly model: string | null;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  health(): Promise<ProviderHealth>;
}

/** Why a provider call failed. `retryable` drives the bounded retry policy (ai-architecture §6). */
export type ProviderErrorKind =
  | 'UNCONFIGURED'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'AUTH_FAILED'
  | 'BAD_REQUEST'
  | 'BAD_RESPONSE';

const RETRYABLE: ReadonlySet<ProviderErrorKind> = new Set([
  'NETWORK',
  'RATE_LIMITED',
  'SERVER_ERROR',
]);

/** Carries a kind and a safe message only: never the URL, key, prompt or provider body. */
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string = kind,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
  get retryable(): boolean {
    return RETRYABLE.has(this.kind);
  }
}
