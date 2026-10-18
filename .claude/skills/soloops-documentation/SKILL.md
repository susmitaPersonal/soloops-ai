---
name: soloops-documentation
description: Keep SoloOps AI documentation consistent with behaviour — requirements, business rules, design, API, data model, ADRs, traceability, implementation status, onboarding — with stable IDs and working links. Use whenever behaviour, API, schema, rules or setup change, before finishing a PR, or when asked to write or fix docs.
---

# SoloOps documentation

## Purpose
Docs are the project's memory. Keep them true, consistent, linked and clear about what is implemented versus planned.

## When to use
- Any behaviour, API, schema, rule, config or setup change.
- Before marking work done.
- When writing new docs.

## Required inputs
The change (diff or description) and the IDs affected.

## Procedure
1. Find the affected docs using the [docs index](../../../docs/README.md):
   | Change | Docs to update |
   | --- | --- |
   | Rule | business-rules.md (+ ADR if material) |
   | Requirement | requirements.md, acceptance-criteria.md |
   | State | change-request-lifecycle.md |
   | Endpoint | api-design.md (and the generated OpenAPI once it exists) |
   | Table | data-model.md |
   | Config | environment-configuration.md |
   | Setup | local-development.md, troubleshooting.md |
   | Anything shipped | requirements-traceability.md and implementation-status.md |
   | Unresolved gap | known-limitations.md |
2. **IDs are stable.**
   - Use the next free number.
   - Never renumber or reuse an ID.
   - Mark removed items `Withdrawn`.
3. **Separate fact from plan.**
   - Mark designs `Proposed` or `Planned` until the code and passing tests exist.
   - Never mark a requirement `Done` based on docs alone.
4. **Avoid unsupported claims.** That means no invented benchmarks, versions, coverage figures, legal compliance or model quality.
5. **Use relative links** to files and headings (GitHub slug anchors). Use Mermaid for flows and states when it helps.
6. **Write for a newcomer.** The reader may never have seen the conversation. Define terms or link to the glossary in `soloops-product-context`.
7. **Run `node scripts/check-docs.mjs`** and fix every reported broken link or anchor. Report the actual output.
8. If CLAUDE.md pointers or skill and agent references changed, update them.

## Output
Updated documents and the docs-check result.

## Quality checklist
- [ ] Every affected doc is updated in the same change.
- [ ] No contradictions with business rules or accepted ADRs.
- [ ] Status labels are accurate (implemented vs planned).
- [ ] The docs check passes, and the output is quoted.
