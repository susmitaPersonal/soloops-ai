---
name: soloops-solution-design
description: Turn a validated SoloOps requirement or idea into user stories, acceptance criteria, workflows, state transitions, edge cases and screen behaviour. Use when designing a new feature, refining a vague requirement, adding acceptance criteria, or checking a design for gaps before implementation.
---

# SoloOps solution design

## Purpose
Produce designs that are complete enough to implement and test, consistent with the business rules, and traceable by ID.

## When to use
- A new or changed FR needs user stories and ACs.
- A workflow or state machine needs to change.
- Before implementation, to find requirement gaps and edge cases.

## Required inputs
- The FR ID(s), or a description of the idea (run `soloops-product-context` first if scope is unclear).
- The affected personas and journeys.

## Procedure
1. Read the relevant sections of:
   - [solution-design.md](../../../docs/design/solution-design.md)
   - [change-request-lifecycle.md](../../../docs/design/change-request-lifecycle.md)
   - [workflows.md](../../../docs/design/workflows.md)
   - [acceptance-criteria.md](../../../docs/product/acceptance-criteria.md)
2. Answer the 7 feature questions:
   1. Problem
   2. Users
   3. Inputs and outputs
   4. Business rules (BR IDs)
   5. Error cases
   6. How it will be tested
   7. What is excluded
3. Write user stories `US-nnn` (next free number) and acceptance criteria `AC-nnn.k` in Given/When/Then form. Cover:
   - happy path
   - validation boundaries
   - authorisation (member vs owner, foreign workspace → 404)
   - state conflicts (409), stale edits (412), idempotent retries
   - AI-unavailable behaviour, if AI is involved
4. If states change, update the state diagram and transition table. Any transition not listed is illegal.
5. Specify UI behaviour: loading, empty, error and success states, confirmation for irreversible actions, accessibility notes.
6. List open questions instead of inventing business decisions. Add them to [open-questions.md](../../../docs/product/open-questions.md) with a working assumption.
7. Add the rows to [requirements-traceability.md](../../../docs/quality/requirements-traceability.md) and matching `TC-nnn.k` entries to [test-plan.md](../../../docs/quality/test-plan.md).

## Edge-case prompts
Concurrent users, double submit, archived parents, partial failures mid-transaction, currency mismatch, empty lists, maximum lengths, time zones and dates (decision date ≤ today), and AI returning junk.

## Output
Updated design docs with stories, ACs, diagrams (Mermaid), traceability rows and open questions.

## Quality checklist
- [ ] Every AC is testable and has a TC.
- [ ] No AC contradicts a BR. If a BR must change, that is flagged for an ADR or maintainer decision.
- [ ] Negative and boundary cases are included.
- [ ] Exclusions are stated explicitly.
- [ ] Mermaid diagrams render (check the syntax).
