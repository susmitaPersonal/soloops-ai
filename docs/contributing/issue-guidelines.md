# Issue Guidelines

## Types and labels

| Label | Use for |
| --- | --- |
| `bug` | Behaviour contradicts docs or rules |
| `feature` | Implements a documented requirement (reference its FR ID) |
| `proposal` | New idea not yet in requirements. Discuss before code |
| `docs` | Documentation fixes or improvements |
| `security` | **Do not file publicly.** See below |
| `good first issue` | Small, well-scoped, with pointers to files and docs |
| `hacktoberfest` | Suitable for Hacktoberfest contributions |
| module labels | `core-ops`, `scope-guard`, `billing`, `ai`, `community`, `platform` |

## Bug report template

```markdown
**Expected** (link the rule/AC, e.g. BR-017):
**Actual:**
**Steps to reproduce:** 1. … 2. …
**Environment:** commit SHA, OS, browser, AI provider (none/mock/openai-compatible)
**Logs:** (redact secrets and personal data)
```

## Feature issue template

```markdown
**Requirement:** FR-… / US-…
**Acceptance criteria:** AC-…
**Proposed approach:** modules, endpoints, screens touched
**Out of scope:**
```

## Security issues

Report vulnerabilities privately using GitHub's private vulnerability reporting on the repository once it is published. Maintainers must enable it before the first public release. Never include real personal data in reports.
