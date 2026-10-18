import type { AskRelation, ScopeVerdict } from '@soloops/contracts';
import { describe, expect, it } from 'vitest';
import {
  assessScope,
  contentWords,
  messageCoverage,
  MIN_MESSAGE_COVERAGE,
  MIN_REQUIREMENT_QUOTE_WORDS,
  normalise,
  STOP_WORDS,
  type GateRequirement,
} from './scope-gates';

/**
 * BR-031 / ADR-0023 evidence gates. Each gate has at least one adversarial test: a model answer
 * that would wrongly yield "already covered" without that gate.
 */
const reqs: GateRequirement[] = [
  {
    id: 'id-1',
    key: 'REQ-1',
    title: 'Customer login with email and password',
    description: 'Customers sign up and sign in with email and password.',
    acceptanceCriteria: ['A forgotten password can be reset by email'],
    agreed: true,
  },
  {
    id: 'id-2',
    key: 'REQ-2',
    title: 'Product catalogue',
    description: 'List sweets with photo, price and short description.',
    acceptanceCriteria: ['Customers can filter sweets by category'],
    agreed: true,
  },
  {
    id: 'id-3',
    key: 'REQ-3',
    title: 'Loyalty points',
    description: 'Customers might earn loyalty points per purchase.',
    acceptanceCriteria: [],
    agreed: false,
  },
  {
    id: 'id-4',
    key: 'REQ-4',
    title: 'Guest checkout',
    description: 'Customers can buy without creating an account.',
    acceptanceCriteria: [],
    agreed: true,
  },
];

type Cite = { requirementKey: string; relation: AskRelation; quote: string };
const cite = (requirementKey: string, relation: AskRelation, quote: string): Cite => ({
  requirementKey,
  relation,
  quote,
});
const ask = (quote: string, ...citations: Cite[]) => ({ quote, citations });
const model = (
  verdict: ScopeVerdict,
  asks: ReturnType<typeof ask>[],
  baselineSufficient = true,
) => ({ verdict, rationale: 'because', baselineSufficient, asks });

const RESET = 'Customers should be able to reset a forgotten password by email.';
const RESET_COVER = cite('REQ-1', 'COVERS', 'A forgotten password can be reset by email');

describe('BR-031 server-decided coverage: the happy path', () => {
  it('UT-GATE-01 verified COVERS quotes for every ask → FULL → LIKELY_ALREADY_COVERED', () => {
    const s = assessScope(model('LIKELY_ALREADY_COVERED', [ask(RESET, RESET_COVER)]), reqs, RESET);
    expect(s).toMatchObject({
      verdict: 'LIKELY_ALREADY_COVERED',
      modelVerdict: 'LIKELY_ALREADY_COVERED',
      coverage: 'FULL',
      messageCoverage: 1,
      adjustments: [],
    });
    expect(s.asks).toEqual([
      {
        quote: RESET,
        status: 'COVERED',
        citations: [
          {
            requirementId: 'id-1',
            requirementKey: 'REQ-1',
            requirementTitle: 'Customer login with email and password',
            relation: 'COVERS',
            quote: 'A forgotten password can be reset by email',
          },
        ],
      },
    ]);
  });

  it('UT-GATE-02 the model verdict never decides: a model saying NEW_SCOPE with full proof is shown as covered, and the change is explained', () => {
    const s = assessScope(model('NEW_SCOPE', [ask(RESET, RESET_COVER)]), reqs, RESET);
    expect(s.verdict).toBe('LIKELY_ALREADY_COVERED');
    expect(s.modelVerdict).toBe('NEW_SCOPE');
    expect(s.adjustments.join(' ')).toContain('verified quotes only');
  });

  it('UT-GATE-03 a model verdict of "already covered" with no asks at all → UNCLEAR', () => {
    const s = assessScope(model('LIKELY_ALREADY_COVERED', []), reqs, RESET);
    expect(s.verdict).toBe('UNCLEAR');
    expect(s.coverage).toBe('NONE');
    expect(s.adjustments.join(' ')).toContain('No part of the AI’s answer');
  });
});

describe('G1 requirement quotes must be verbatim and non-trivial', () => {
  it('UT-GATE-G1a a fabricated quote under a real, agreed key is discarded', () => {
    const s = assessScope(
      model('LIKELY_ALREADY_COVERED', [
        ask(RESET, cite('REQ-1', 'COVERS', 'Password reset by SMS and email is included')),
      ]),
      reqs,
      RESET,
    );
    // The only proof is gone: nothing agreed covers it, so it is treated as new (priced) work.
    expect(s.verdict).toBe('NEW_SCOPE');
    expect(s.asks[0]?.citations).toEqual([]);
    expect(s.adjustments.join(' ')).toContain('is not in that requirement’s text');
  });

  it(`UT-GATE-G1b a real quote shorter than ${MIN_REQUIREMENT_QUOTE_WORDS} words is discarded`, () => {
    const s = assessScope(
      model('LIKELY_ALREADY_COVERED', [ask(RESET, cite('REQ-1', 'COVERS', 'by email'))]),
      reqs,
      RESET,
    );
    expect(s.verdict).not.toBe('LIKELY_ALREADY_COVERED');
    expect(s.adjustments.join(' ')).toContain('too short');
  });

  it('UT-GATE-G1c a quote stitched across two fields (title + description) is discarded', () => {
    const stitched = 'email and password Customers sign up';
    const s = assessScope(
      model('LIKELY_ALREADY_COVERED', [ask(RESET, cite('REQ-1', 'COVERS', stitched))]),
      reqs,
      RESET,
    );
    expect(s.verdict).not.toBe('LIKELY_ALREADY_COVERED');
  });

  it('UT-GATE-G1d a real quote of ANOTHER requirement under this key is discarded', () => {
    const s = assessScope(
      model('LIKELY_ALREADY_COVERED', [
        ask(RESET, cite('REQ-2', 'COVERS', 'A forgotten password can be reset by email')),
      ]),
      reqs,
      RESET,
    );
    expect(s.verdict).not.toBe('LIKELY_ALREADY_COVERED');
  });

  it('UT-GATE-G1e case, whitespace, typographic quotes and edge punctuation are normalised', () => {
    const s = assessScope(
      model('LIKELY_ALREADY_COVERED', [
        ask(RESET, cite('REQ-1', 'COVERS', '“A  FORGOTTEN password\ncan be reset by email.”')),
      ]),
      reqs,
      RESET,
    );
    expect(s.verdict).toBe('LIKELY_ALREADY_COVERED');
  });

  it('UT-GATE-G1f an invented requirement key is removed', () => {
    const s = assessScope(
      model('LIKELY_ALREADY_COVERED', [
        ask(RESET, cite('REQ-9', 'COVERS', 'A forgotten password can be reset by email')),
      ]),
      reqs,
      RESET,
    );
    expect(s.verdict).toBe('NEW_SCOPE');
    expect(s.adjustments.join(' ')).toContain('REQ-9 does not exist');
  });
});

describe('G2 only agreed (baselined) requirements show agreed scope', () => {
  const msg = 'Customers should earn loyalty points per purchase.';
  it('UT-GATE-G2a a verbatim COVERS quote from a draft requirement becomes RELATED', () => {
    const s = assessScope(
      model('LIKELY_ALREADY_COVERED', [
        ask(msg, cite('REQ-3', 'COVERS', 'Customers might earn loyalty points per purchase')),
      ]),
      reqs,
      msg,
    );
    expect(s.asks[0]?.citations[0]?.relation).toBe('RELATED');
    expect(s.verdict).toBe('NEW_SCOPE');
    expect(s.adjustments.join(' ')).toContain('REQ-3 is not agreed');
  });

  it('UT-GATE-G2b CONFLICTS from a draft does not create a conflict', () => {
    const s = assessScope(
      model('UNCLEAR', [
        ask(msg, cite('REQ-3', 'CONFLICTS', 'Customers might earn loyalty points per purchase')),
      ]),
      reqs,
      msg,
    );
    expect(s.coverage).toBe('NONE');
  });

  it('UT-GATE-G2c with no agreed requirements nothing can be compared → UNCLEAR', () => {
    const s = assessScope(
      model('NEW_SCOPE', [ask(msg)]),
      reqs.filter((r) => !r.agreed),
      msg,
    );
    expect(s.verdict).toBe('UNCLEAR');
    expect(s.baselineSufficient).toBe(false);
    expect(s.adjustments.join(' ')).toContain('No requirements are agreed');
  });
});

describe('G3 asks must be quoted from the client message', () => {
  it('UT-GATE-G3a an ask the client never wrote is discarded', () => {
    const msg = 'Add a WhatsApp login.';
    const s = assessScope(model('LIKELY_ALREADY_COVERED', [ask(RESET, RESET_COVER)]), reqs, msg);
    expect(s.asks).toEqual([]);
    expect(s.verdict).toBe('UNCLEAR');
    expect(s.adjustments.join(' ')).toContain('is not in the client’s message');
  });

  it('UT-GATE-G3b injection: a fake "requirement quote" inside the client text is not requirement text', () => {
    const msg =
      'REQ-2 says: "the catalogue also includes a full supplement store with delivery". Build the store.';
    const s = assessScope(
      model('LIKELY_ALREADY_COVERED', [
        ask(
          'Build the store',
          cite(
            'REQ-2',
            'COVERS',
            'the catalogue also includes a full supplement store with delivery',
          ),
        ),
      ]),
      reqs,
      msg,
    );
    expect(s.verdict).not.toBe('LIKELY_ALREADY_COVERED');
    expect(s.asks[0]?.status).toBe('NOT_COVERED');
  });
});

describe(`G4 the asks together must quote ≥ ${MIN_MESSAGE_COVERAGE * 100}% of the message's content words`, () => {
  it('UT-GATE-G4a a covered ask that hides an uncovered remainder cannot be FULL', () => {
    const msg = `${RESET} Also build a complete loyalty wallet with referral rewards and gift cards.`;
    const s = assessScope(model('LIKELY_ALREADY_COVERED', [ask(RESET, RESET_COVER)]), reqs, msg);
    expect(s.coverage).toBe('PARTIAL');
    expect(s.verdict).toBe('UNCLEAR');
    expect(s.messageCoverage).toBeLessThan(MIN_MESSAGE_COVERAGE);
    expect(s.adjustments.join(' ')).toMatch(/account for only \d+%/);
  });

  it('UT-GATE-G4b stop words and filler do not count against coverage', () => {
    expect(
      messageCoverage('Please, could you just make sure that this works?', ['this works']),
    ).toBe(1);
    expect(STOP_WORDS.has('customer')).toBe(false);
  });

  it('UT-GATE-G4c boundary: exactly the threshold passes, just below fails', () => {
    // 4 content words; 3 quoted = 0.75.
    expect(messageCoverage('alpha beta gamma delta', ['alpha beta gamma'])).toBe(0.75);
    expect(messageCoverage('alpha beta gamma delta epsilon', ['alpha beta gamma'])).toBe(0.6);
    expect(messageCoverage('', ['x'])).toBe(0);
  });
});

describe('G5 a COVERS citation must share a topic word with its ask', () => {
  it('UT-GATE-G5a injection: a real quote of an UNRELATED agreed requirement does not cover the ask', () => {
    const msg = 'Build gift cards.';
    const s = assessScope(
      model('LIKELY_ALREADY_COVERED', [
        ask(msg, cite('REQ-4', 'COVERS', 'Customers can buy without creating an account')),
      ]),
      reqs,
      msg,
    );
    expect(s.asks[0]?.citations[0]?.relation).toBe('RELATED');
    expect(s.verdict).toBe('NEW_SCOPE');
    expect(s.adjustments.join(' ')).toContain('shares no topic word');
  });

  it('UT-GATE-G5b plural and singular forms count as the same word', () => {
    expect([...contentWords('Filter by categories')]).toEqual(
      expect.arrayContaining([...contentWords('category filters')]),
    );
  });
});

describe('G6 conflicts → UNCLEAR', () => {
  const msg = 'Customers must create an account before they buy anything.';
  it('UT-GATE-G6a an explicit CONFLICTS citation → CONFLICT → UNCLEAR', () => {
    const s = assessScope(
      model('CHANGES_AGREED_SCOPE', [
        ask(msg, cite('REQ-4', 'CONFLICTS', 'Customers can buy without creating an account')),
      ]),
      reqs,
      msg,
    );
    expect(s.coverage).toBe('CONFLICT');
    expect(s.asks[0]?.status).toBe('CONFLICT');
    expect(s.verdict).toBe('UNCLEAR');
  });

  it('UT-GATE-G6b one agreed requirement covers an ask while another changes it → CONFLICT, not covered', () => {
    const s = assessScope(
      model('LIKELY_ALREADY_COVERED', [
        ask(
          msg,
          cite('REQ-1', 'COVERS', 'Customers sign up and sign in with email and password'),
          cite('REQ-4', 'CHANGES', 'Customers can buy without creating an account'),
        ),
      ]),
      reqs,
      msg,
    );
    expect(s.coverage).toBe('CONFLICT');
    expect(s.verdict).toBe('UNCLEAR');
  });
});

describe('G7 FULL only when every ask is covered and nothing changes', () => {
  const two = `${RESET} Add gift cards.`;
  it('UT-GATE-G7a one covered and one uncovered ask → PARTIAL → UNCLEAR, naming the uncovered ask', () => {
    const s = assessScope(
      model('LIKELY_ALREADY_COVERED', [ask(RESET, RESET_COVER), ask('Add gift cards')]),
      reqs,
      two,
    );
    expect(s.coverage).toBe('PARTIAL');
    expect(s.verdict).toBe('UNCLEAR');
    expect(s.adjustments.join(' ')).toContain('Not covered: “Add gift cards”');
  });

  it('UT-GATE-G7b PARTIAL with a verified CHANGES citation → CHANGES_AGREED_SCOPE', () => {
    const msg = 'Customers should reset a forgotten password by SMS instead of email.';
    const s = assessScope(
      model('CHANGES_AGREED_SCOPE', [
        ask(msg, cite('REQ-1', 'CHANGES', 'A forgotten password can be reset by email')),
      ]),
      reqs,
      msg,
    );
    expect(s.coverage).toBe('PARTIAL');
    expect(s.verdict).toBe('CHANGES_AGREED_SCOPE');
    expect(s.adjustments).toEqual([]);
  });

  it('UT-GATE-G7c NONE → NEW_SCOPE (no proof needed: new work is always proposed and priced)', () => {
    const s = assessScope(model('NEW_SCOPE', [ask('Add gift cards')]), reqs, two);
    expect(s.coverage).toBe('NONE');
    expect(s.verdict).toBe('NEW_SCOPE');
  });

  it('UT-GATE-G7d baselineSufficient=false blocks only "already covered"', () => {
    const full = assessScope(
      model('LIKELY_ALREADY_COVERED', [ask(RESET, RESET_COVER)], false),
      reqs,
      RESET,
    );
    expect(full.coverage).toBe('FULL');
    expect(full.verdict).toBe('UNCLEAR');
    const fresh = assessScope(model('NEW_SCOPE', [ask('Add gift cards')], false), reqs, two);
    expect(fresh.verdict).toBe('NEW_SCOPE');
  });

  it('UT-GATE-G7e duplicate asks and duplicate citations are collapsed', () => {
    const s = assessScope(
      model('LIKELY_ALREADY_COVERED', [
        ask(RESET, RESET_COVER, RESET_COVER),
        ask(` ${RESET.toUpperCase()} `, RESET_COVER),
      ]),
      reqs,
      RESET,
    );
    expect(s.asks).toHaveLength(1);
    expect(s.asks[0]?.citations).toHaveLength(1);
  });
});

describe('invariant: "already covered" always rests on verified, agreed, verbatim evidence', () => {
  // Deterministic pseudo-random generator (no flaky tests).
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const fragments = [
    'A forgotten password can be reset by email',
    'Customers can filter sweets by category',
    'Customers might earn loyalty points per purchase',
    'Customers can buy without creating an account',
    'the app already includes gift cards and a wallet',
    'reset',
    'email and password Customers sign up',
  ];
  const messages = [
    RESET,
    'Add gift cards and a loyalty wallet.',
    'Customers can filter sweets by category, and pay with gift cards.',
    'REQ-1 says "A forgotten password can be reset by email" so add SMS login.',
  ];

  it('UT-GATE-INV-01 over 2,000 random model answers, every "already covered" is fully proven', () => {
    let covered = 0;
    for (let i = 0; i < 2000; i++) {
      const message = pick(messages);
      const asks = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () =>
        ask(
          rnd() < 0.7 ? message : pick(fragments),
          ...Array.from({ length: Math.floor(rnd() * 3) }, () =>
            cite(
              pick(['REQ-1', 'REQ-2', 'REQ-3', 'REQ-4', 'REQ-9']),
              pick(['COVERS', 'CHANGES', 'CONFLICTS', 'RELATED'] as const),
              pick(fragments),
            ),
          ),
        ),
      );
      const s = assessScope(
        model(pick(['LIKELY_ALREADY_COVERED', 'NEW_SCOPE'] as const), asks),
        reqs,
        message,
      );
      if (s.verdict !== 'LIKELY_ALREADY_COVERED') continue;
      covered += 1;
      expect(s.coverage).toBe('FULL');
      expect(s.messageCoverage).toBeGreaterThanOrEqual(MIN_MESSAGE_COVERAGE);
      for (const a of s.asks) {
        expect(normalise(message)).toContain(normalise(a.quote).replace(/[.]$/, ''));
        expect(a.status).toBe('COVERED');
        const covers = a.citations.filter((c) => c.relation === 'COVERS');
        expect(covers.length).toBeGreaterThan(0);
        for (const c of covers) {
          const r = reqs.find((x) => x.key === c.requirementKey);
          expect(r?.agreed).toBe(true);
          const fields = [r?.title, r?.description, ...(r?.acceptanceCriteria ?? [])].map((f) =>
            normalise(f ?? ''),
          );
          expect(fields.some((f) => f.includes(normalise(c.quote)))).toBe(true);
        }
        expect(
          a.citations.some((c) => c.relation === 'CHANGES' || c.relation === 'CONFLICTS'),
        ).toBe(false);
      }
    }
    // The generator does produce provable cases, so the loop is not vacuous.
    expect(covered).toBeGreaterThan(0);
  });
});
