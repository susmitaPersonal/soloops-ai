# Troubleshooting

> Entries marked *(planned)* apply to features not built yet. Entries marked *(seen)* were hit during M1. Add real problems and fixes here as contributors hit them.

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `node scripts/check-docs.mjs` reports a broken link | A file was renamed or a heading changed | Update the link or anchor. Anchors are GitHub-style slugs of headings |
| API exits with "Invalid configuration: SESSION_SECRET …" | Missing or short secret | Generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `/readyz` returns 503 | MongoDB not running, no replica-set primary, or migrations pending | `docker compose up -d mongo`, wait for healthy, then `npm run db:migrate` |
| "Transaction numbers are only allowed on a replica set member or mongos" | MongoDB started without `--replSet`, or the URI lacks `replicaSet=rs0` | Use the compose service. Check `MONGODB_URI` |
| *(seen)* First `npm test` run is slow or times out in a hook | `mongodb-memory-server` is downloading `mongod` (~780 MB) | Wait for it once; it is cached afterwards. Or point tests at Compose with `MONGODB_URI_TEST` |
| *(seen)* Vitest: "Failed to start forks worker … reading 'bind'" in `undici` | A `jsdom` major that needs a newer Node 22 minor was hoisted | Keep the root `jsdom` pin (29.1.1) or upgrade Node to ≥ 22.22 |
| *(seen)* `npm install` prints `EBADENGINE` warnings | A dependency needs a newer Node 22 minor | Use Node ≥ 22.12. Do not add packages that need newer Node without an ADR-0016 amendment |
| Server Components get 401 while the browser is signed in | `lib/api/server.ts` is not forwarding the session cookie, or `API_INTERNAL_URL` is wrong | Check `apps/web/.env.local`. The helper forwards only `soloops_sid` / `__Host-soloops_sid` |
| Browser calls to `/api/*` hit the wrong port after `next build` | Rewrites are resolved at build time | Set `API_INTERNAL_URL` before `next build` |
| Port 27017, 3000, 3100 or 4000 already in use | Another MongoDB, Next.js, E2E or API process is running | Stop it, or change `PORT` / the Next.js `--port` |
| *(seen)* `docker compose up -d mongo`: "ports are not available … 27017" | Another `mongod` (for example a native install) already listens on 27017 | Stop it, or map Compose to another host port with a `docker-compose.override.yml` (`ports: !override ['127.0.0.1:27018:27017']`) **and** connect with `mongodb://127.0.0.1:27018/?directConnection=true`. Changing the port alone is not enough: the replica set advertises `localhost:27017`, so the driver would silently switch to the other `mongod` |
| Every mutation returns 403 `CSRF_REJECTED` | Missing `X-Requested-With` or `APP_ORIGIN` mismatch | Use the app's API client. Set `APP_ORIGIN` to the exact browser origin |
| Sign-in returns 429 during local testing | Auth rate limits (per IP + email, per email, per IP) | Wait for the 15-minute window, or restart the API (limits are in memory) |
| *(planned)* AI status shows "unreachable" | Wrong `AI_BASE_URL`/`AI_MODEL`, or the endpoint is down | `curl $AI_BASE_URL/models` (add an auth header if needed). Check the model name |
| *(planned)* AI analysis always `INVALID_OUTPUT` | Endpoint ignores the `response_format` mode | Set `AI_STRUCTURED_OUTPUT=prompt` |
| Line endings cause noisy diffs on Windows | `core.autocrlf` | `.gitattributes` enforces LF |
