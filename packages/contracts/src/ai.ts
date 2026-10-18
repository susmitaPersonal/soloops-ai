import { z } from 'zod';
import { idSchema, minorUnitsSchema } from './common';
import { riskSeveritySchema, scopeVerdictSchema } from './scope-guard';

/**
 * AI contracts (FR-021, FR-050–FR-054; docs/architecture/ai-architecture.md §4).
 * The output schema has **no money fields**: cost is computed by the application (BR-027).
 */

const text = (max: number) => z.string().trim().min(1).max(max);
const strList = (max = 20) => z.array(text(300)).max(max);

/**
 * `cr-analysis-output@1`: what the model must return. Unknown properties are stripped (z.object
 * strips by default), so price-like or extra fields are discarded (BR-027).
 */
export const crAnalysisOutputSchemaV1 = z.object({
  clarifiedDescription: text(4000),
  inScope: strList(),
  outOfScope: strList(),
  acceptanceCriteria: z.array(text(300)).min(1).max(20),
  affectedRequirementKeys: z.array(z.string().regex(/^REQ-\d+$/)).max(50),
  dependencies: strList(),
  assumptions: strList(),
  effortHours: z
    .object({
      low: z.number().positive().max(2000),
      likely: z.number().positive().max(2000),
      high: z.number().positive().max(2000),
    })
    .refine((e) => e.low <= e.likely && e.likely <= e.high, {
      error: 'effortHours must satisfy low ≤ likely ≤ high',
    }),
  risks: z.array(z.object({ description: text(300), severity: riskSeveritySchema })).max(10),
  timelineImpact: z.string().trim().max(500),
  questionsForClient: strList(),
});
export const CR_ANALYSIS_SCHEMA_VERSION_V1 = 'cr-analysis-output@1';

/** How one agreed requirement bears on the request: already covers it, is changed by it, or is merely related. */
export const evidenceRelations = ['COVERS', 'CHANGES', 'RELATED'] as const;
export const evidenceRelationSchema = z.enum(evidenceRelations);
export type EvidenceRelation = z.infer<typeof evidenceRelationSchema>;

/**
 * `cr-analysis-output@2` (kept for existing generations): `@1` plus a scope assessment against the agreed requirements. Evidence
 * cites requirement keys only; the server keeps evidence that names a real requirement of the
 * project and downgrades unsupported verdicts to `UNCLEAR` (ai-architecture §4).
 */
export const crAnalysisOutputSchemaV2 = crAnalysisOutputSchemaV1.extend({
  /**
   * Extra effort in hours. 0 is allowed (an already-covered request needs no extra work); a range
   * whose high is 0 is mapped to NO estimate, so people never see a zero range (BR-026).
   */
  effortHours: z
    .object({
      low: z.number().min(0).max(2000),
      likely: z.number().min(0).max(2000),
      high: z.number().min(0).max(2000),
    })
    .refine((e) => e.low <= e.likely && e.likely <= e.high, {
      error: 'effortHours must satisfy low ≤ likely ≤ high',
    }),
  questionsForClient: strList(10),
  scopeAssessment: z.object({
    verdict: scopeVerdictSchema,
    rationale: z.string().trim().max(600),
    baselineSufficient: z.boolean(),
    evidence: z
      .array(
        z.object({
          requirementKey: z.string().regex(/^REQ-\d+$/),
          relation: evidenceRelationSchema,
          explanation: text(300),
        }),
      )
      .max(10),
  }),
});
export type CrAnalysisOutputV2 = z.infer<typeof crAnalysisOutputSchemaV2>;
export const CR_ANALYSIS_SCHEMA_VERSION_V2 = 'cr-analysis-output@2';

/**
 * How a cited agreed requirement bears on one ask of the client (`cr-analysis-output@3`):
 * already describes it, is changed by it, contradicts it, or is only in the same area.
 */
export const askRelations = ['COVERS', 'CHANGES', 'CONFLICTS', 'RELATED'] as const;
export const askRelationSchema = z.enum(askRelations);
export type AskRelation = z.infer<typeof askRelationSchema>;

/**
 * `cr-analysis-output@3` (ADR-0023): the model splits the client message into asks, each with a
 * verbatim quote of the message, and cites agreed requirements per ask with a verbatim quote of
 * the requirement text. The model's verdict is kept for transparency only; the SERVER decides
 * coverage from the quotes it can verify (BR-031, ai-architecture §4).
 */
export const crAnalysisOutputSchema = crAnalysisOutputSchemaV2.extend({
  scopeAssessment: z.object({
    verdict: scopeVerdictSchema,
    rationale: z.string().trim().max(600),
    baselineSufficient: z.boolean(),
    asks: z
      .array(
        z.object({
          quote: text(500),
          citations: z
            .array(
              z.object({
                requirementKey: z.string().regex(/^REQ-\d+$/),
                relation: askRelationSchema,
                quote: text(500),
              }),
            )
            .max(10),
        }),
      )
      .max(10),
  }),
});
export type CrAnalysisOutput = z.infer<typeof crAnalysisOutputSchema>;
export const CR_ANALYSIS_SCHEMA_VERSION = 'cr-analysis-output@3';

/** Server-computed coverage of the whole request from verified evidence only (BR-031). */
export const scopeCoverages = ['FULL', 'PARTIAL', 'NONE', 'CONFLICT'] as const;
export const scopeCoverageSchema = z.enum(scopeCoverages);
export type ScopeCoverage = z.infer<typeof scopeCoverageSchema>;

/** Per-ask result after the server checks: what the verified evidence shows for that ask. */
export const askStatuses = ['COVERED', 'CHANGES', 'CONFLICT', 'NOT_COVERED'] as const;
export const askStatusSchema = z.enum(askStatuses);
export type AskStatus = z.infer<typeof askStatusSchema>;

/** The suggestion as shown to people: mapped to project IDs and minutes (ai-architecture §4). */
export const crSuggestionSchema = z.object({
  clarifiedDescription: z.string(),
  inScope: z.array(z.string()),
  outOfScope: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  affectedRequirementIds: z.array(idSchema),
  affectedRequirementKeys: z.array(z.string()),
  dependencies: z.array(z.string()),
  assumptions: z.array(z.string()),
  /** Null when the model estimated no extra effort (e.g. already covered). */
  effort: z
    .object({
      lowMinutes: z.number().int(),
      likelyMinutes: z.number().int(),
      highMinutes: z.number().int(),
    })
    .nullable(),
  risks: z.array(z.object({ description: z.string(), severity: riskSeveritySchema })),
  timelineImpact: z.string(),
  questionsForClient: z.array(z.string()),
  /**
   * Scope check after server validation. `verdict` is what the app stands behind; `modelVerdict`
   * is what the model said. They differ when the evidence did not support the model's verdict,
   * and `adjustments` says why.
   */
  scope: z.object({
    verdict: scopeVerdictSchema,
    modelVerdict: scopeVerdictSchema,
    rationale: z.string(),
    baselineSufficient: z.boolean(),
    coverage: scopeCoverageSchema,
    /** Share (0–1) of the message's content words that the verified asks quote (gate G4). */
    messageCoverage: z.number().min(0).max(1),
    /** Asks whose quote was found in the client message, with only verified citations. */
    asks: z.array(
      z.object({
        quote: z.string(),
        status: askStatusSchema,
        citations: z.array(
          z.object({
            requirementId: idSchema,
            requirementKey: z.string(),
            requirementTitle: z.string(),
            relation: askRelationSchema,
            quote: z.string(),
          }),
        ),
      }),
    ),
    adjustments: z.array(z.string()),
  }),
});
export type CrSuggestion = z.infer<typeof crSuggestionSchema>;

export const analysisWarningSchema = z.object({ code: z.string(), message: z.string() });

export const analysisResponseSchema = z.object({
  generationId: idSchema,
  promptVersion: z.string(),
  schemaVersion: z.string(),
  provider: z.string(),
  model: z.string(),
  suggestion: crSuggestionSchema,
  /** Indicative only, computed by the app from minutes × resolved rate (BR-027). */
  indicativeCost: z
    .object({
      currency: z.string(),
      hourlyRateMinor: minorUnitsSchema,
      lowMinor: minorUnitsSchema,
      likelyMinor: minorUnitsSchema,
      highMinor: minorUnitsSchema,
    })
    .nullable(),
  warnings: z.array(analysisWarningSchema),
});
export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;

export const aiProviders = ['none', 'mock', 'openai-compatible'] as const;
export const aiProviderSchema = z.enum(aiProviders);
export type AiProviderId = z.infer<typeof aiProviderSchema>;

/** FR-053: is AI configured and reachable? Never includes the URL or the key. */
export const aiStatusSchema = z.object({
  provider: aiProviderSchema,
  model: z.string().nullable(),
  health: z.enum(['ok', 'unconfigured', 'unreachable']),
  workspaceEnabled: z.boolean(),
  /** FR-054 disclosure: exactly what is sent when enabled. */
  disclosure: z.array(z.string()),
});
export type AiStatus = z.infer<typeof aiStatusSchema>;

/** FR-054 / AC-022.3: owners enable AI only after acknowledging the disclosure. */
export const aiEnablementRequestSchema = z
  .object({
    enabled: z.boolean(),
    acknowledgeDisclosure: z.boolean().optional(),
  })
  .refine((v) => !v.enabled || v.acknowledgeDisclosure === true, {
    error: 'Acknowledge what is sent to the AI provider before enabling it.',
    path: ['acknowledgeDisclosure'],
  });
export type AiEnablementRequest = z.input<typeof aiEnablementRequestSchema>;

/** FR-054: the disclosure text shown before enabling, kept in one place. */
export const AI_DISCLOSURE = [
  'The change request text exactly as you recorded it (up to the configured limit).',
  'The project name and description.',
  'The keys, titles, short descriptions and acceptance criteria of the project’s requirements, and whether each is agreed.',
  'Nothing else: no client contact details, rates, prices or invoices.',
  'The provider’s own retention policy applies to what it receives.',
];
