# ADR-0022: Evidence-bound AI scope check and workspace members

- **Status:** Accepted
- **Date:** 2026-10-19
- **Related:** FR-004, FR-021, FR-022, BR-001–BR-003, BR-008, BR-011, BR-023, BR-026, BR-028, BR-031, ADR-0005, ADR-0006, ADR-0018, ADR-0021

## Context
Two gaps were found by the 2026-10-19 theme audit (release audit §14):
- **The open-weight model was not used for the product's central question.** The question is "Is this client request already agreed scope, a change, new work, or unclear?" The model drafted proposal text, but nothing compared the request with the agreed requirements, and its questions for the client were thrown away.
- **Small freelance teams could not share a workspace.** FR-004 (members) was not built.

## Decision

### Scope check (FR-021, prompt `cr-analysis@2`, schema `cr-analysis-output@2`)
1. The model receives each requirement marked `[agreed]` (baselined) or `[draft]`, and returns `scopeAssessment`:
   - `verdict`;
   - `rationale`;
   - `baselineSufficient`;
   - `evidence[]`, each with `requirementKey`, relation `COVERS | CHANGES | RELATED`, and an explanation.

   `@1` stays for existing generation records.
2. **The server decides what is shown** (`assessScope`, pure and unit-tested):
   - evidence citing a key that does not exist is dropped;
   - `COVERS` or `CHANGES` on a requirement that is not agreed becomes `RELATED`;
   - with no agreed requirements, or a baseline the model calls insufficient, the verdict is `UNCLEAR`;
   - "already covered" needs `COVERS` evidence and must not also show `CHANGES`;
   - "changes agreed scope" needs `CHANGES` evidence;
   - "new scope" must not cite `COVERS` or `CHANGES`.

   Any other verdict becomes `UNCLEAR`, and the reason is shown. The model's own verdict is returned alongside, so a downgrade is visible.
3. **A person confirms the verdict.**
   - `scopeVerdict` and `questionsForClient` are new, optional version fields (migration 0006). They are editable only in a draft and carry AI provenance like the other fields.
   - They are part of the content hash, so the client's decision binds them (BR-008).
   - They are added to the hash **only when set**, so every version hashed before 0006 keeps a byte-identical hash and existing approvals stay valid.
4. **Zero extra effort is a valid model answer** (already-covered work). It maps to *no* estimate, never a zero range (BR-026); with no estimate there is no indicative cost.
5. **Measured before any quality claim.** There is a 23-case dataset, an opt-in runner (`npm run eval:ai`), and thresholds fixed in code before the first run. Results are in [AI evaluation results](../../quality/ai-evaluation-results.md).

### Members (FR-004)
1. `GET`/`POST {ws}/members` and `DELETE {ws}/members/{userId}`:
   - Any member can list. Only owners can add or remove (middleware plus a service check).
   - Owners add an **existing** account by email, always as `MEMBER`. There are no invitations and no role editing, so the scope stays minimal.
2. Workspace and identity stay decoupled through **ports** (`WorkspacePorts`, the same late-binding pattern as `CoreOpsPorts`), because identity already depends on workspace for registration. The ports return only public profile fields.
3. **The last owner can never be removed.** Every membership change increments `workspaces.membershipVersion` (migration 0007) inside its transaction. Two concurrent changes therefore write the same document, so one gets a write conflict, retries, and re-checks the owner count.

   A timestamp was tried first and rejected: setting an unchanged value is a no-op and caused no conflict (found by TC-003.8).
4. Changes are audited in the same transaction (`member.added`, `member.removed`, BR-028). Access ends on the next request because membership is checked on every request.

### Migrations
0006 and 0007 read the collection's current `$jsonSchema`, add one optional property, and re-apply it. Merged migrations are never edited and their schemas are not duplicated.

## Alternatives considered
- **Trust the model's verdict as returned.** Rejected: the evaluation showed contradictory evidence in most answers from the small model.
- **Relax the evidence rules to raise measured accuracy.** Rejected: that would accept contradictory evidence, which the product owner ruled out, and it would be tuning to the test.
- **Store the AI verdict as the version's verdict.** Rejected: AI suggests and humans decide (BR-001). The stored verdict is the person's.
- **Invitations by email.** Rejected for the MVP: they need email sending, which is out of scope, and FR-004 says "existing users".
- **A `rowVersion` bump as the membership lock.** Rejected: it would make open settings forms stale for an unrelated change.

## Rationale
- The open model now answers the product's core question with checked, cited evidence, which is where its value lies.
- The deterministic server rules keep the costly error (calling new work "already covered") at zero in the shipped configuration, even with a weak model.
- Members reuse existing patterns (ports, `requireMembership`, audit in the transaction), with no new architecture.

## Consequences
- With `qwen2.5:1.5b`, most scope checks end `UNCLEAR`. Accuracy failed its threshold (30% against 70%), so no model is recommended (known limitations).
- The proposal summary shows the confirmed verdict and the questions to the client.
- The isolation matrix (TC-SEC-01/02) now covers 54 tenant routes.
- The member-assignee check for tasks still runs outside the task transaction (known limitation; member removal now exists).

## Security and operational implications
- **The AI module still has no write path, and the verdict changes no state** (IT-SCOPE-02 asserts 0 approvals, tasks and invoices).
- **Client text stays data.** It is delimited and neutralised in the prompt, and the scope rules ignore any instruction the model echoes.
- **Member routes are in the isolation and owner-only matrices.** Unknown, foreign or malformed user IDs give `404`.
- **Adding by email reveals whether an account exists, to owners only.** Registration already reveals this (known limitation).
