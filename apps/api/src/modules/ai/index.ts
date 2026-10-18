// Public API of the ai module. It imports no domain module (BR-001, TC-ARCH-01): it returns data
// and records its own generations, nothing else.
export { createAiService, type AiService, type AnalyzeInput, type AnalyzeResult } from './service';
export { createProvider, noneProvider, ProviderError, type ChatModelProvider } from './providers';
export { createMockProvider, MOCK_MODEL, validSuggestion } from './providers/mock';
export { createOpenAiCompatibleProvider } from './providers/openai-compatible';
