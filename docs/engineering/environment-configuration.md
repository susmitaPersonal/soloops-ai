# Environment Configuration

Configuration comes from environment variables. Never commit real values. Each app has its own example file (created in M1): `apps/api/.env.example` and `apps/web/.env.example`. Local copies are `apps/api/.env` and `apps/web/.env.local`, and both are git-ignored.

## `apps/api` (validated with Zod at startup)

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `development`, `test` or `production` |
| `PORT` | no | `4000` | API port (internal) |
| `APP_ORIGIN` | yes | — | Public origin of the site, for example `https://ops.example.com` (dev: `http://localhost:3000`). Used for the Origin/CSRF check |
| `MONGODB_URI` | yes | — | Connection string to a **replica set**, for example `mongodb://localhost:27017/?replicaSet=rs0` (**secret** if it contains credentials) |
| `MONGODB_DB` | no | `soloops` | Database name. Tests use a unique name per file |
| `SESSION_SECRET` | yes | — | At least 32 characters; in production ≥ 32 random bytes, base64 (**secret**). HMAC-signs the session cookie. Rotating it signs everyone out |
| `COOKIE_SECURE` | prod: yes | `false` | Must be `true` in production. When `true` the cookie is named `__Host-soloops_sid` (Secure, Path=/, host-only) |
| `SESSION_IDLE_DAYS` / `SESSION_ABSOLUTE_DAYS` | no | `7` / `30` | Session lifetimes |
| `LOG_LEVEL` | no | `info` | pino level |
| `ARGON2_MEMORY_KIB` / `ARGON2_ITERATIONS` | no | `19456` / `2` | Password hashing cost. Production refuses lower values |
| `ARGON2_MAX_CONCURRENCY` | no | `4` | Concurrent argon2id computations. Up to 8× this many requests wait; beyond that they get `503` |
| `TRUST_PROXY` | no | `false` | Set `true` only behind exactly one reverse proxy that **appends** the client address to `X-Forwarded-For` (for example nginx `$proxy_add_x_forwarded_for`). The API then uses the **rightmost** entry for rate limits |
| `RATE_LIMIT_AUTH_PER_IP` | no | `30` | Sign-in attempts per IP per 15 minutes, across all emails |
| `RATE_LIMIT_REGISTER_PER_IP` | no | `10` | Registrations per IP per hour |
| `AI_PROVIDER` | no | `none` | `none`, `mock` or `openai-compatible` |
| `AI_BASE_URL` | if openai-compatible | — | For example `https://<host>/v1` |
| `AI_API_KEY` | depends on endpoint | — | **Secret.** Never logged |
| `AI_MODEL` | if openai-compatible | — | Model identifier understood by the endpoint |
| `AI_STRUCTURED_OUTPUT` | no | `prompt` | `json_schema`, `json_object` or `prompt` |
| `AI_TIMEOUT_MS` | no | `60000` | Per analysis, total |
| `AI_MAX_RETRIES` | no | `1` | Network/5xx/429 retries |
| `AI_MAX_INPUT_CHARS` | no | `12000` | Input truncation limit |
| `AI_MAX_OUTPUT_TOKENS` | no | `1500` | Output cap |
| `AI_STORE_PROMPTS` | no | `false` | Store full prompt text in `aiGenerations` |
| `RATE_LIMIT_AI_PER_HOUR` | no | `20` | Per workspace |
| `AI_GENERATION_RETENTION_DAYS` | no | `365` | TTL of `aiGenerations` records (OQ-013) |

Production refuses to start if `COOKIE_SECURE` is not `true`, if `SESSION_SECRET` is too short, if `MONGODB_URI` does not target a replica set, or if `AI_PROVIDER=mock`.

**AI behaviour (M3, implemented):**
- `AI_BASE_URL` is deliberately not validated at startup. A wrong or unreachable endpoint must not stop the app (AC-022.2): `GET {ws}/ai/status` reports `unreachable` (a 3-second `GET {AI_BASE_URL}/models` probe), and analysis requests fail with `502 AI_PROVIDER_ERROR`.
- A missing `AI_BASE_URL` or `AI_MODEL` with `openai-compatible` counts as `unconfigured`. AI cannot be enabled, and analysis returns `409 AI_DISABLED`.
- Retries cover network errors, 5xx and 429, at most `AI_MAX_RETRIES` times, with jittered back-off inside the `AI_TIMEOUT_MS` budget. Invalid credentials (401/403) and other 4xx errors are never retried. Invalid JSON or a schema violation gets exactly one repair attempt.
- Verifying a real endpoint needs credentials and network access. The automated suite never calls one; it uses scripted providers, the `mock` adapter and a local HTTP stub.
- **Small local models:** use `AI_STRUCTURED_OUTPUT=json_schema` if the runtime supports it (Ollama does). In the 2026-10-18 smoke test, `qwen2.5:1.5b` passed schema validation 4/4 times with `json_schema` and 1/4 with the default `prompt`. A 2026-10-19 repeat passed 3/3 in both modes. Samples this small do not settle which mode is more reliable. Validation is never loosened for a weaker model: failures fall back to manual entry.

## `apps/web`

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `API_INTERNAL_URL` | yes | `http://localhost:4000` | Where Server Components and rewrites reach the API. A **server-only** variable, private network in production. The `/api` rewrite is resolved at **build time**, so set it before `next build` |
| `NEXT_PUBLIC_APP_NAME` | no | `SoloOps AI` | Display name |

The web app holds **no secrets**. Any `NEXT_PUBLIC_*` variable is inlined into the browser bundle, so never put credentials, URIs with passwords, or AI keys there ([ADR-0009](../architecture/adr/0009-nextjs-app-router-frontend.md)).

## Docker Compose (local)

`docker-compose.yml` defines `mongo` (`mongo:8.2.12`) running `mongod --replSet rs0`, bound to `127.0.0.1:27017`, with a health check that initialises the replica set on first start. **Not yet verified on the maintainer machine** (the Docker daemon was not running during M1).
