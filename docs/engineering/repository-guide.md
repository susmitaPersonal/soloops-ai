# Repository Guide

## Current contents (observed 2026-10-16)

```text
.
├── CLAUDE.md                 # Claude Code project instructions
├── README.md                 # Project entry point
├── LICENSE                   # MIT (confirmed, OQ-001)
├── .gitignore
├── .claude/
│   ├── skills/               # 8 project skills (soloops-*)
│   └── agents/               # 6 specialist agents
├── scripts/
│   ├── check-docs.mjs        # Documentation link, anchor, ID and frontmatter checker (Node, no dependencies)
│   └── check-contrast.mjs    # WCAG contrast check of the design-system colour tokens (Node, no dependencies)
└── docs/                     # All product, design, architecture, engineering, quality and contributing docs
```

**No application code exists yet.** The planned layout is in the [monorepo structure](../architecture/monorepo-structure.md#layout) and is created in milestone M1.

## Where to find things

| You want to… | Go to |
| --- | --- |
| Understand the product | [product overview](../product/product-overview.md) |
| Know the rules that must never break | [business rules](../product/business-rules.md) |
| See what to build next | [roadmap](../product/roadmap.md), [implementation status](../quality/implementation-status.md) |
| Understand a design decision | [ADRs](../architecture/adr/README.md) |
| Add an endpoint | [API design](../architecture/api-design.md), [backend architecture](../architecture/backend-architecture.md) |
| Add or change AI behaviour | [AI architecture](../architecture/ai-architecture.md) |
| Write tests | [testing strategy](../architecture/testing-strategy.md), [test plan](../quality/test-plan.md) |
| Contribute | [contribution guide](../contributing/contribution-guide.md) |

## Authoritative sources (precedence)

When sources disagree, the higher one wins. Then fix the lower one in the same PR.

1. [Business rules](../product/business-rules.md) and [requirements](../product/requirements.md)
2. Accepted [ADRs](../architecture/adr/README.md)
3. Architecture and design documents
4. Code (once it exists). If code contradicts docs, treat it as a defect in one of them and resolve it explicitly
5. Conversation history (never authoritative)
