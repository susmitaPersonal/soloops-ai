import type { AppConfig } from '../../../platform/config';
import { createMockProvider } from './mock';
import { createOpenAiCompatibleProvider } from './openai-compatible';
import { ProviderError, type ChatModelProvider } from './types';

/** `none` (the default): AI is off; analysis returns 409 AI_DISABLED (AC-022.1). */
export const noneProvider: ChatModelProvider = {
  id: 'none',
  model: null,
  async health() {
    return 'unconfigured';
  },
  async complete() {
    throw new ProviderError('UNCONFIGURED');
  },
};

/** Provider registry (ai-architecture.md §3). New adapters implement the same port. */
export function createProvider(config: AppConfig): ChatModelProvider {
  switch (config.AI_PROVIDER) {
    case 'mock':
      return createMockProvider();
    case 'openai-compatible':
      return createOpenAiCompatibleProvider({
        baseUrl: config.AI_BASE_URL,
        apiKey: config.AI_API_KEY,
        model: config.AI_MODEL,
        structuredOutput: config.AI_STRUCTURED_OUTPUT,
      });
    default:
      return noneProvider;
  }
}

export { ProviderError, type ChatModelProvider } from './types';
