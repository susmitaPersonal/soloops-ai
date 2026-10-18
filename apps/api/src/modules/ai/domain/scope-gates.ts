import type {
  AskStatus,
  CrAnalysisOutput,
  CrSuggestion,
  ScopeCoverage,
  ScopeVerdict,
} from '@soloops/contracts';

/**
 * Evidence gates of the scope check (BR-031, ADR-0023, ai-architecture §4). The model decomposes
 * the client message into asks and cites requirement text; this file decides — deterministically,
 * from verified quotes only — whether the request is already covered. Pure: no I/O, no clock.
 *
 * Constants below were fixed BEFORE any evaluation run of `cr-analysis@3` and must not be tuned to
 * results; a change needs new held-out cases (ai-evaluation-results.md).
 */

/** G1: a requirement quote must have at least this many words to count. */
export const MIN_REQUIREMENT_QUOTE_WORDS = 4;
/** G4: verified ask quotes must account for at least this share of the message's content words. */
export const MIN_MESSAGE_COVERAGE = 0.75;

/**
 * Words that carry no topic for G4 and G5: English function words plus request filler. Domain
 * words (customer, payment, booking …) are deliberately NOT here. Fixed before evaluation.
 */
export const STOP_WORDS: ReadonlySet<string> = new Set(
  (
    'a an the and or but nor so yet if then than that this these those there here ' +
    'is are was were be been being am do does did done doing have has had having ' +
    'i me my mine we us our ours you your yours he him his she her hers it its they them their theirs ' +
    'who whom whose which what when where why how all any both each every some such no not only own same ' +
    'too very just also even still again already as at by for from in into of off on onto out over under ' +
    'to up down with without within about above below between through during before after while until ' +
    'can could will would shall should may might must need needs needed want wants wanted ' +
    'please pls kindly make sure ensure able like etc ok okay thanks thank hi hello dear ' +
    'confirm confirming confirmed right let lets get gets got go going one way thing things stuff ' +
    'add adding also new now well really actually'
  ).split(/\s+/),
);

type Model = CrAnalysisOutput['scopeAssessment'];
type Scope = CrSuggestion['scope'];
type Ask = Scope['asks'][number];
type Citation = Ask['citations'][number];

/** A requirement as the gates see it. `agreed` = baselined (BR-004), whose text is frozen. */
export interface GateRequirement {
  id: string;
  key: string;
  title: string;
  description: string;
  acceptanceCriteria: readonly string[];
  agreed: boolean;
}

/** Case- and whitespace-normalised text; typographic quotes and dashes folded to ASCII. */
export function normalise(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A quote as matched: normalised, without surrounding punctuation or quote marks. */
function normaliseQuote(s: string): string {
  return normalise(s).replace(/^[\s"'.,;:!?…()[\]-]+|[\s"'.,;:!?…()[\]-]+$/g, '');
}

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu;

export function words(s: string): string[] {
  return normalise(s).match(WORD) ?? [];
}

/**
 * Light, documented stemming for plurals only: `-ies` → `-y` ("categories" ~ "category"), else a
 * trailing `s` is dropped (not `ss`), so "slots" ~ "slot".
 */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  return w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
}

export function contentWords(s: string): Set<string> {
  return new Set(
    words(s)
      .filter((w) => !STOP_WORDS.has(w) && (w.length > 1 || /\d/.test(w)))
      .map(stem),
  );
}

/** G1: the quote occurs verbatim (normalised) inside ONE field of the requirement's frozen text. */
function quoteInRequirement(quote: string, r: GateRequirement): boolean {
  const q = normaliseQuote(quote);
  if (q === '') return false;
  return [r.title, r.description, ...r.acceptanceCriteria].some((f) => normalise(f).includes(q));
}

/**
 * G4: share of the message's content-word tokens that fall inside a verified ask quote. Ask quotes
 * are located in the normalised message; each occurrence marks its character range.
 */
export function messageCoverage(message: string, askQuotes: readonly string[]): number {
  const m = normalise(message);
  const covered: [number, number][] = [];
  for (const raw of askQuotes) {
    const q = normaliseQuote(raw);
    if (q === '') continue;
    for (let at = m.indexOf(q); at !== -1; at = m.indexOf(q, at + 1)) {
      covered.push([at, at + q.length]);
    }
  }
  let total = 0;
  let inside = 0;
  for (const match of m.matchAll(WORD)) {
    const w = match[0];
    if (STOP_WORDS.has(w) || (w.length <= 1 && !/\d/.test(w))) continue;
    total += 1;
    const start = match.index;
    const end = start + w.length;
    if (covered.some(([a, b]) => start >= a && end <= b)) inside += 1;
  }
  return total === 0 ? 0 : inside / total;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const short = (s: string) => (s.length > 80 ? `${s.slice(0, 77)}…` : s);

/**
 * The scope check SoloOps stands behind. Gates G1–G7 (ADR-0023):
 * - G1 requirement quote verbatim in that requirement's text and ≥ 4 words, else discarded;
 * - G2 only agreed (baselined) requirements show agreed scope, else RELATED;
 * - G3 ask quote verbatim in the client message, else the ask is discarded;
 * - G4 ask quotes cover ≥ 75% of the message's content words, else coverage cannot be FULL;
 * - G5 a COVERS citation counts only if ask and quote share a content word, else RELATED;
 * - G6 any CONFLICTS, or COVERS and CHANGES from two agreed requirements on one ask → CONFLICT;
 * - G7 FULL only when every ask has a verified COVERS and none has CHANGES or CONFLICTS.
 * The model's verdict never establishes coverage; it is returned as `modelVerdict`.
 */
export function assessScope(
  model: Model,
  requirements: readonly GateRequirement[],
  message: string,
): Scope {
  const byKey = new Map(requirements.map((r) => [r.key, r]));
  const adjustments: string[] = [];
  const normMessage = normalise(message);
  const asks: Ask[] = [];
  const seenAsks = new Set<string>();

  for (const ask of model.asks) {
    const q = normaliseQuote(ask.quote);
    // G3: the ask must be grounded in what the client actually wrote.
    if (q === '' || !normMessage.includes(q)) {
      adjustments.push(
        `A part of the request the AI described (“${short(ask.quote)}”) is not in the client’s message, so it was ignored.`,
      );
      continue;
    }
    if (seenAsks.has(q)) continue;
    seenAsks.add(q);
    const askWords = contentWords(ask.quote);
    const citations: Citation[] = [];
    const seenCites = new Set<string>();
    for (const c of ask.citations) {
      const req = byKey.get(c.requirementKey);
      if (!req) {
        adjustments.push(`${c.requirementKey} does not exist in this project, so it was removed.`);
        continue;
      }
      // G1: real, non-trivial quote of that requirement's own text.
      if (words(c.quote).length < MIN_REQUIREMENT_QUOTE_WORDS) {
        adjustments.push(
          `The quote given for ${req.key} is too short to show anything (fewer than ${MIN_REQUIREMENT_QUOTE_WORDS} words), so it was removed.`,
        );
        continue;
      }
      if (!quoteInRequirement(c.quote, req)) {
        adjustments.push(
          `The quote given for ${req.key} (“${short(c.quote)}”) is not in that requirement’s text, so it was removed.`,
        );
        continue;
      }
      let relation = c.relation;
      // G2: drafts are never agreed scope.
      if (relation !== 'RELATED' && !req.agreed) {
        adjustments.push(
          `${req.key} is not agreed (baselined) yet, so it cannot show agreed scope; it is shown as related.`,
        );
        relation = 'RELATED';
      }
      // G5: "covers" must at least be about the same thing.
      if (relation === 'COVERS') {
        const overlap = [...contentWords(c.quote)].some((w) => askWords.has(w));
        if (!overlap) {
          adjustments.push(
            `The quote from ${req.key} shares no topic word with “${short(ask.quote)}”, so it does not count as covering it.`,
          );
          relation = 'RELATED';
        }
      }
      const dedupe = `${req.key}|${relation}`;
      if (seenCites.has(dedupe)) continue;
      seenCites.add(dedupe);
      citations.push({
        requirementId: req.id,
        requirementKey: req.key,
        requirementTitle: req.title,
        relation,
        quote: c.quote.trim(),
      });
    }
    asks.push({ quote: ask.quote.trim(), status: askStatus(citations), citations });
  }

  const coverageShare = messageCoverage(
    message,
    asks.map((a) => a.quote),
  );
  const anyAgreed = requirements.some((r) => r.agreed);
  const baselineSufficient = anyAgreed && model.baselineSufficient;

  // Coverage from verified evidence only (G4, G6, G7).
  let coverage: ScopeCoverage;
  if (asks.some((a) => a.status === 'CONFLICT')) coverage = 'CONFLICT';
  else if (asks.length > 0 && asks.every((a) => a.status === 'COVERED')) {
    coverage = coverageShare >= MIN_MESSAGE_COVERAGE ? 'FULL' : 'PARTIAL';
  } else if (asks.some((a) => a.status === 'COVERED' || a.status === 'CHANGES')) {
    coverage = 'PARTIAL';
  } else coverage = 'NONE';

  // Final verdict: decided here. Only "already covered" needs full proof (asymmetric policy).
  const reasons: string[] = [];
  let verdict: ScopeVerdict;
  const uncovered = asks
    .filter((a) => a.status === 'NOT_COVERED')
    .map((a) => `“${short(a.quote)}”`);
  if (!anyAgreed) {
    verdict = 'UNCLEAR';
    reasons.push(
      'No requirements are agreed (baselined) yet, so there is no agreed scope to compare with.',
    );
  } else if (asks.length === 0) {
    verdict = 'UNCLEAR';
    reasons.push('No part of the AI’s answer could be matched to the client’s message.');
  } else if (coverage === 'FULL') {
    if (baselineSufficient) verdict = 'LIKELY_ALREADY_COVERED';
    else {
      verdict = 'UNCLEAR';
      reasons.push('The AI reported that the agreed requirements are not enough to decide.');
    }
  } else if (coverage === 'CONFLICT') {
    verdict = 'UNCLEAR';
    reasons.push(
      'Agreed requirements conflict with each other or with the request, so a person must decide.',
    );
  } else if (coverage === 'PARTIAL') {
    if (asks.some((a) => a.citations.some((c) => c.relation === 'CHANGES'))) {
      verdict = 'CHANGES_AGREED_SCOPE';
    } else {
      verdict = 'UNCLEAR';
      reasons.push(
        uncovered.length > 0
          ? `Only part of the request is shown to be covered by agreed requirements. Not covered: ${uncovered.join(', ')}.`
          : `The AI’s quotes account for only ${pct(coverageShare)} of the client’s message, so the rest may not be covered.`,
      );
    }
  } else {
    verdict = 'NEW_SCOPE';
  }

  if (
    verdict !== model.verdict &&
    model.verdict === 'LIKELY_ALREADY_COVERED' &&
    reasons.length === 0
  ) {
    reasons.push(
      '“Already covered” needs every part of the request to be backed by a verified quote from an agreed requirement, and that proof was missing.',
    );
  }
  if (verdict !== model.verdict && reasons.length === 0) {
    reasons.push(
      `SoloOps decides the verdict from the verified quotes only (coverage: ${coverageLabel(coverage)}).`,
    );
  }
  if (verdict !== model.verdict) adjustments.push(...reasons);
  else if (verdict === 'UNCLEAR' && model.verdict === 'UNCLEAR') {
    // Same verdict: nothing was downgraded, but keep the reason for the person.
    adjustments.push(...reasons.filter((r) => r.startsWith('No requirements')));
  }

  return {
    verdict,
    modelVerdict: model.verdict,
    rationale: model.rationale,
    baselineSufficient,
    coverage,
    messageCoverage: Math.round(coverageShare * 1000) / 1000,
    asks,
    adjustments,
  };
}

function askStatus(citations: readonly Citation[]): AskStatus {
  const agreedRel = new Set(citations.map((c) => c.relation));
  // G6: explicit conflict, or one agreed requirement covers it while another changes it.
  if (agreedRel.has('CONFLICTS')) return 'CONFLICT';
  const coveringKeys = new Set(
    citations.filter((c) => c.relation === 'COVERS').map((c) => c.requirementKey),
  );
  const changingKeys = new Set(
    citations.filter((c) => c.relation === 'CHANGES').map((c) => c.requirementKey),
  );
  if ([...coveringKeys].some((k) => [...changingKeys].some((j) => j !== k))) return 'CONFLICT';
  if (changingKeys.size > 0) return 'CHANGES';
  if (coveringKeys.size > 0) return 'COVERED';
  return 'NOT_COVERED';
}

function coverageLabel(c: ScopeCoverage): string {
  switch (c) {
    case 'FULL':
      return 'fully covered';
    case 'PARTIAL':
      return 'partly covered';
    case 'CONFLICT':
      return 'conflicting';
    default:
      return 'not covered';
  }
}
