# Contributing to SoloOps AI

Thanks for helping. SoloOps AI is free and open source under the [MIT License](LICENSE), with no paid tiers. The full guide is [docs/contributing/contribution-guide.md](docs/contributing/contribution-guide.md); this page is the short version.

## Set up

Requires Node.js 22 (≥ 22.12, see `.nvmrc`) and npm 10. Docker is optional.

```bash
npm ci
cp apps/api/.env.example apps/api/.env       # then set SESSION_SECRET (command is in the file)
cp apps/web/.env.example apps/web/.env.local
docker compose up -d mongo                   # optional: MongoDB replica set for `npm run dev`
npm run db:migrate
npm run dev                                  # web http://localhost:3000, API :4000
```

The tests do not need Docker: they start a real MongoDB replica set with `mongodb-memory-server` (the first run downloads `mongod`, about 780 MB). Details: [local development](docs/engineering/local-development.md) and [troubleshooting](docs/engineering/troubleshooting.md).

## Before you open a pull request

```bash
npm run validate      # lint, typecheck, unit + component + API integration tests, build, docs check
npm run test:coverage # coverage gates (CI runs this)
npm run build && npm run test:e2e   # Playwright (once: npx playwright install chromium)
```

- Work on a branch named `feat/<short-name>` or `fix/<short-name>`, never directly on `main`.
- Keep the change small: one requirement, or a slice of one. Link the FR/US/AC IDs and name tests by ID (`TC-012.3`, `BR-010`).
- Update the docs your change makes stale, and follow the [PR checklist](docs/contributing/pull-request-checklist.md).
- Report only results you actually ran. Do not weaken tests or coverage gates.
- The [business rules](docs/product/business-rules.md) are invariants. For example, AI never approves or prices anything, and only approved work is billable.

## Never commit secrets

`.env` and `.env.*` files are git-ignored; only `.env.example` files with empty placeholders are tracked. Never commit API keys, `SESSION_SECRET` values, database dumps or real client data. Use `example.com` addresses in tests and fixtures.

## Conduct and licensing

All participation follows the [code of conduct](docs/contributing/code-of-conduct.md). By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).
