import {
  ProviderError,
  type ChatModelProvider,
  type CompletionRequest,
  type CompletionResult,
  type ProviderHealth,
} from './types';

/** Upper bound on a provider response body we are willing to read (excessive output guard). */
const MAX_RESPONSE_BYTES = 1_000_000;
const HEALTH_TIMEOUT_MS = 3000;

export interface OpenAiCompatibleOptions {
  baseUrl: string | undefined;
  apiKey: string | undefined;
  model: string | undefined;
  structuredOutput: 'json_schema' | 'json_object' | 'prompt';
  fetch?: typeof fetch;
}

function endpoint(baseUrl: string | undefined, path: string): URL | null {
  if (!baseUrl) return null;
  try {
    const url = new URL(`${baseUrl.replace(/\/+$/, '')}${path}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new ProviderError('BAD_RESPONSE', 'response too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Adapter for any endpoint exposing the OpenAI-compatible `POST /chat/completions` shape
 * (vLLM, llama.cpp server, Ollama compatibility mode, hosted open-model providers). Each
 * concrete endpoint must be verified by the operator (ai-architecture.md §3).
 */
export function createOpenAiCompatibleProvider(opts: OpenAiCompatibleOptions): ChatModelProvider {
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const headers = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    Accept: 'application/json',
    // SEC-007: the key is sent only to AI_BASE_URL, in this header, and never logged.
    ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
  });

  return {
    id: 'openai-compatible',
    model: opts.model ?? null,

    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const url = endpoint(opts.baseUrl, '/chat/completions');
      if (!url || !opts.model) throw new ProviderError('UNCONFIGURED');
      const body: Record<string, unknown> = {
        model: opts.model,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        max_tokens: req.maxOutputTokens,
        temperature: req.temperature,
        stream: false,
      };
      if (opts.structuredOutput === 'json_object') body.response_format = { type: 'json_object' };
      if (opts.structuredOutput === 'json_schema' && req.jsonSchema) {
        body.response_format = {
          type: 'json_schema',
          json_schema: { name: 'cr_analysis', schema: req.jsonSchema, strict: false },
        };
      }

      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify(body),
          signal: req.signal,
        });
      } catch (err) {
        if (req.signal.aborted) throw new ProviderError('TIMEOUT');
        throw new ProviderError('NETWORK', err instanceof Error ? err.name : 'network error');
      }

      if (res.status === 401 || res.status === 403) {
        await res.body?.cancel();
        throw new ProviderError('AUTH_FAILED');
      }
      if (res.status === 429) {
        await res.body?.cancel();
        const retryAfter = Number(res.headers.get('retry-after'));
        throw new ProviderError(
          'RATE_LIMITED',
          'rate limited',
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
        );
      }
      if (res.status >= 500) {
        await res.body?.cancel();
        throw new ProviderError('SERVER_ERROR', `status ${res.status}`);
      }
      if (!res.ok) {
        await res.body?.cancel();
        throw new ProviderError('BAD_REQUEST', `status ${res.status}`);
      }

      let raw: string;
      try {
        raw = await readCapped(res);
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        if (req.signal.aborted) throw new ProviderError('TIMEOUT');
        throw new ProviderError('NETWORK', 'body read failed');
      }
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new ProviderError('BAD_RESPONSE', 'response is not JSON');
      }
      const choice = (json as { choices?: { message?: { content?: unknown } }[] }).choices?.[0];
      const text = choice?.message?.content;
      if (typeof text !== 'string') throw new ProviderError('BAD_RESPONSE', 'no message content');
      const usage = (json as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } })
        .usage;
      const model = (json as { model?: unknown }).model;
      return {
        text,
        model: typeof model === 'string' && model.length <= 200 ? model : opts.model,
        ...(Number.isSafeInteger(usage?.prompt_tokens)
          ? { inputTokens: usage?.prompt_tokens as number }
          : {}),
        ...(Number.isSafeInteger(usage?.completion_tokens)
          ? { outputTokens: usage?.completion_tokens as number }
          : {}),
      };
    },

    async health(): Promise<ProviderHealth> {
      const url = endpoint(opts.baseUrl, '/models');
      if (!url || !opts.model) return 'unconfigured';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      try {
        const res = await doFetch(url, { headers: headers(), signal: controller.signal });
        await res.body?.cancel();
        return res.ok ? 'ok' : 'unreachable';
      } catch {
        return 'unreachable';
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
