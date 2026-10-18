import { createHash } from 'node:crypto';
import {
  CR_ANALYSIS_SCHEMA_VERSION,
  type AiProviderId,
  type CrAnalysisOutput,
  type CrSuggestion,
} from '@soloops/contracts';
import type { Clock } from '../../platform/clock';
import type { AppConfig } from '../../platform/config';
import type { Database } from '../../platform/db';
import { errors, type AppError } from '../../platform/errors';
import { createRateLimiter } from '../../platform/http/rate-limit';
import { newId } from '../../platform/ids';
import type { Logger } from '../../platform/logging';
import { mapSuggestion, parseModelText, type MappingWarning } from './domain/output';
import * as crAnalysis from './prompts/cr-analysis/v3';
import { ProviderError, type ChatModelProvider } from './providers';
import type { ProviderHealth } from './providers/types';

/** Persistence shape of `aiGenerations` (data-model.md §4.14). Owned by this module only. */
export interface AiGenerationDoc {
  _id: string;
  workspaceId: string;
  feature: 'cr-analysis';
  promptVersion: string;
  schemaVersion: string;
  provider: AiProviderId;
  model: string;
  status: 'SUCCEEDED' | 'FAILED';
  errorCode: string | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  inputHash: string;
  /** Validated output only (no money fields exist in the schema). */
  output: CrAnalysisOutput | null;
  /** Only when AI_STORE_PROMPTS=true. */
  prompt: { system: string; user: string } | null;
  subject: { type: 'CHANGE_REQUEST_VERSION'; changeRequestId: string; versionNumber: number };
  requestedByUserId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalyzeInput {
  workspaceId: string;
  userId: string;
  changeRequestId: string;
  versionNumber: number;
  projectName: string;
  projectDescription: string;
  /**
   * Minimised context (SEC-008): keys, titles, short descriptions, acceptance criteria and whether
   * each is agreed (baselined), so the scope check compares against agreed scope only. The full
   * text is also what the evidence gates verify quotes against (BR-031, ADR-0023).
   */
  requirements: {
    id: string;
    key: string;
    title: string;
    description: string;
    acceptanceCriteria: string[];
    agreed: boolean;
  }[];
  requestText: string;
}

export interface AnalyzeResult {
  generationId: string;
  promptVersion: string;
  schemaVersion: string;
  provider: AiProviderId;
  model: string;
  suggestion: CrSuggestion;
  warnings: MappingWarning[];
}

type FailureCode =
  | 'UNCONFIGURED'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'AUTH_FAILED'
  | 'BAD_REQUEST'
  | 'BAD_RESPONSE'
  | 'INVALID_OUTPUT';

class AnalysisFailure extends Error {
  constructor(readonly code: FailureCode) {
    super(code);
  }
}

/** Provider-facing JSON schema for `json_schema` structured-output mode (mirrors the Zod schema). */
const strArr = { type: 'array', items: { type: 'string' } };
export const OUTPUT_JSON_SCHEMA = {
  type: 'object',
  required: [
    'clarifiedDescription',
    'inScope',
    'outOfScope',
    'acceptanceCriteria',
    'affectedRequirementKeys',
    'dependencies',
    'assumptions',
    'effortHours',
    'risks',
    'timelineImpact',
    'questionsForClient',
    'scopeAssessment',
  ],
  properties: {
    clarifiedDescription: { type: 'string' },
    inScope: strArr,
    outOfScope: strArr,
    acceptanceCriteria: strArr,
    affectedRequirementKeys: strArr,
    dependencies: strArr,
    assumptions: strArr,
    effortHours: {
      type: 'object',
      required: ['low', 'likely', 'high'],
      properties: { low: { type: 'number' }, likely: { type: 'number' }, high: { type: 'number' } },
    },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['description', 'severity'],
        properties: {
          description: { type: 'string' },
          severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
        },
      },
    },
    timelineImpact: { type: 'string' },
    questionsForClient: strArr,
    scopeAssessment: {
      type: 'object',
      required: ['verdict', 'rationale', 'baselineSufficient', 'asks'],
      properties: {
        verdict: {
          type: 'string',
          enum: ['NEW_SCOPE', 'CHANGES_AGREED_SCOPE', 'LIKELY_ALREADY_COVERED', 'UNCLEAR'],
        },
        rationale: { type: 'string' },
        baselineSufficient: { type: 'boolean' },
        asks: {
          type: 'array',
          items: {
            type: 'object',
            required: ['quote', 'citations'],
            properties: {
              quote: { type: 'string' },
              citations: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['requirementKey', 'relation', 'quote'],
                  properties: {
                    requirementKey: { type: 'string' },
                    relation: {
                      type: 'string',
                      enum: ['COVERS', 'CHANGES', 'CONFLICTS', 'RELATED'],
                    },
                    quote: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

const MAX_REQUIREMENTS = 200;
const BACKOFF_BASE_MS = 500;

/** Sleep that ends early (rejecting) when the overall deadline aborts. */
function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
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

/** ai-architecture §6: how long one reachability probe answers `GET /ai/status`. */
export const HEALTH_CACHE_MS = 30_000;

export function createAiService(deps: {
  db: Database;
  clock: Clock;
  config: AppConfig;
  provider: ChatModelProvider;
  logger: Logger;
  /** Injectable for tests (no real waiting). */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  random?: () => number;
}) {
  const { config, provider } = deps;
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;
  const perWorkspace = createRateLimiter({
    limit: config.RATE_LIMIT_AI_PER_HOUR,
    windowMs: 60 * 60 * 1000,
    clock: deps.clock,
  });
  /** One concurrent analysis per version (ai-architecture §6). Per process. */
  const inFlight = new Set<string>();
  const generations = (ws: string) => deps.db.tenant<AiGenerationDoc>('aiGenerations', ws);

  /** Minimises and truncates the input to AI_MAX_INPUT_CHARS (ai-architecture §6). */
  function promptInput(input: AnalyzeInput): crAnalysis.CrAnalysisPromptInput {
    const max = config.AI_MAX_INPUT_CHARS;
    const truncated = input.requestText.length > max;
    let budget = Math.max(0, max - Math.min(input.requestText.length, max));
    const requirements = input.requirements.slice(0, MAX_REQUIREMENTS).map((r) => {
      // Keys first: titles and descriptions shrink to fit what remains of the budget.
      const title = r.title.slice(0, 200);
      const description = budget > 400 ? r.description.slice(0, 200) : '';
      budget = Math.max(0, budget - title.length - description.length - 12);
      // Acceptance criteria last, while budget remains: quotes may come from any of them.
      const acceptanceCriteria: string[] = [];
      for (const ac of r.acceptanceCriteria.slice(0, 20)) {
        const line = ac.slice(0, 200);
        if (budget <= 400) break;
        acceptanceCriteria.push(line);
        budget = Math.max(0, budget - line.length - 8);
      }
      return { key: r.key, title, description, acceptanceCriteria, agreed: r.agreed };
    });
    return {
      projectName: input.projectName.slice(0, 160),
      projectDescription: input.projectDescription.slice(0, 500),
      requirements,
      requestText: input.requestText.slice(0, max),
      truncated,
    };
  }

  /** One provider call with bounded, jittered retries for retryable failures only. */
  async function callWithRetries(
    user: string,
    signal: AbortSignal,
    usage: { inputTokens: number; outputTokens: number; model: string },
  ): Promise<string> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const res = await provider.complete({
          system: crAnalysis.system,
          user,
          jsonSchema: OUTPUT_JSON_SCHEMA,
          maxOutputTokens: config.AI_MAX_OUTPUT_TOKENS,
          temperature: 0.2,
          signal,
        });
        usage.inputTokens += res.inputTokens ?? 0;
        usage.outputTokens += res.outputTokens ?? 0;
        usage.model = res.model;
        return res.text;
      } catch (err) {
        if (signal.aborted) throw new AnalysisFailure('TIMEOUT');
        if (!(err instanceof ProviderError)) throw new AnalysisFailure('SERVER_ERROR');
        if (!err.retryable || attempt >= config.AI_MAX_RETRIES) throw new AnalysisFailure(err.kind);
        const backoff = err.retryAfterMs ?? BACKOFF_BASE_MS * 2 ** attempt;
        try {
          await sleep(Math.round(backoff * (0.5 + random() * 0.5)), signal);
        } catch {
          throw new AnalysisFailure('TIMEOUT');
        }
      }
    }
  }

  function toAppError(code: FailureCode): AppError {
    switch (code) {
      case 'TIMEOUT':
        return errors.aiTimeout();
      case 'UNCONFIGURED':
        return errors.aiDisabled('The AI provider is not configured. Write the proposal manually.');
      case 'INVALID_OUTPUT':
        return errors.aiInvalidOutput();
      default:
        return errors.aiProviderError();
    }
  }

  let healthCache: { at: number; value: Promise<ProviderHealth> } | null = null;

  return {
    providerId: provider.id,
    model: provider.model,

    /**
     * FR-053: configured and reachable? Cached for HEALTH_CACHE_MS (and shared while a probe is
     * running) so an unreachable endpoint costs page loads one bounded probe, not one each.
     */
    health() {
      const at = deps.clock.now().getTime();
      if (healthCache && at - healthCache.at < HEALTH_CACHE_MS) return healthCache.value;
      const value = provider.health();
      healthCache = { at, value };
      return value;
    },

    /**
     * FR-021: analysis of one draft version. Returns data only — it has no way to change any
     * entity (BR-001, BR-002). Every call records an `aiGenerations` document (FR-052).
     */
    async analyzeChangeRequest(input: AnalyzeInput): Promise<AnalyzeResult> {
      if (provider.id === 'none') {
        throw errors.aiDisabled('No AI provider is configured for this server.');
      }
      perWorkspace.consume(`ai:${input.workspaceId}`);
      const lockKey = `${input.workspaceId}:${input.changeRequestId}:${input.versionNumber}`;
      if (inFlight.has(lockKey)) throw errors.rateLimited(5);
      inFlight.add(lockKey);

      const pi = promptInput(input);
      const user = crAnalysis.buildUser(pi);
      const started = Date.now();
      const usage = { inputTokens: 0, outputTokens: 0, model: provider.model ?? provider.id };
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), config.AI_TIMEOUT_MS);
      let output: CrAnalysisOutput | null = null;
      let failure: FailureCode | null = null;
      try {
        const first = parseModelText(await callWithRetries(user, controller.signal, usage));
        if (first.ok) {
          output = first.output;
        } else {
          // Exactly one repair attempt with the validation errors (ai-architecture §6).
          const repaired = parseModelText(
            await callWithRetries(
              crAnalysis.buildRepair(pi, first.errors),
              controller.signal,
              usage,
            ),
          );
          if (repaired.ok) output = repaired.output;
          else failure = 'INVALID_OUTPUT';
        }
      } catch (err) {
        failure = err instanceof AnalysisFailure ? err.code : 'SERVER_ERROR';
      } finally {
        clearTimeout(deadline);
        inFlight.delete(lockKey);
      }

      const now = deps.clock.now();
      const generationId = newId();
      const latencyMs = Math.max(0, Date.now() - started);
      await generations(input.workspaceId).insertOne({
        _id: generationId,
        feature: 'cr-analysis',
        promptVersion: crAnalysis.id,
        schemaVersion: CR_ANALYSIS_SCHEMA_VERSION,
        provider: provider.id,
        model: usage.model.slice(0, 200),
        status: output ? 'SUCCEEDED' : 'FAILED',
        errorCode: failure,
        latencyMs,
        inputTokens: usage.inputTokens || null,
        outputTokens: usage.outputTokens || null,
        inputHash: createHash('sha256').update(user, 'utf8').digest('hex'),
        output,
        prompt: config.AI_STORE_PROMPTS ? { system: crAnalysis.system, user } : null,
        subject: {
          type: 'CHANGE_REQUEST_VERSION',
          changeRequestId: input.changeRequestId,
          versionNumber: input.versionNumber,
        },
        requestedByUserId: input.userId,
        expiresAt: new Date(now.getTime() + config.AI_GENERATION_RETENTION_DAYS * 86_400_000),
        createdAt: now,
        updatedAt: now,
      });

      // Safe structured log: identifiers and outcome only — never the prompt or client text.
      deps.logger[output ? 'info' : 'warn'](
        {
          event: 'ai.generation',
          feature: 'cr-analysis',
          provider: provider.id,
          status: output ? 'SUCCEEDED' : 'FAILED',
          errorCode: failure,
          latencyMs,
          generationId,
        },
        'ai generation finished',
      );

      if (!output) throw toAppError(failure ?? 'SERVER_ERROR');
      // Ask quotes are verified against the message the model actually saw (G3).
      const mapped = mapSuggestion(output, input.requirements, pi.requestText);
      const warnings = pi.truncated
        ? [
            ...mapped.warnings,
            {
              code: 'INPUT_TRUNCATED' as const,
              message: 'The request text was longer than the AI input limit and was shortened.',
            },
          ]
        : mapped.warnings;
      return {
        generationId,
        promptVersion: crAnalysis.id,
        schemaVersion: CR_ANALYSIS_SCHEMA_VERSION,
        provider: provider.id,
        model: usage.model,
        suggestion: mapped.suggestion,
        warnings,
      };
    },

    /** Provenance check for AI-applied fields: the generation exists and belongs to `subject`. */
    async generationBelongsTo(
      workspaceId: string,
      generationId: string,
      changeRequestId: string,
    ): Promise<boolean> {
      const g = await generations(workspaceId).findOne({ _id: generationId });
      return (
        g !== null && g.status === 'SUCCEEDED' && g.subject.changeRequestId === changeRequestId
      );
    },
  };
}

export type AiService = ReturnType<typeof createAiService>;
