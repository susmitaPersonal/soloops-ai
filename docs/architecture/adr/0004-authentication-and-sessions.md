# ADR-0004: Server-side sessions with argon2id

- **Status:** Accepted. Session storage mechanism amended by [ADR-0012](0012-mongodb-and-data-access.md): sessions are a MongoDB collection with a TTL index. Same-origin transport is defined in [ADR-0013](0013-web-api-communication.md).
- **Date:** 2026-10-16
- **Related:** SEC-001–004, SEC-011, FR-001–004

## Context
Users authenticate with email and password in the MVP. The SPA and API are same-origin. Sessions must be revocable (logout, removed members).

## Decision
- Passwords are hashed with **argon2id**.
- Use **opaque, random session tokens** in an `HttpOnly` cookie. Only a SHA-256 of the token is stored in a `Session` table, with idle and absolute expiry.
- CSRF protection: `SameSite=Lax`, a required custom header and an `Origin` check.
- Authorisation: membership and role are looked up per request from `WorkspaceMembership`.

## Alternatives considered
- **JWT access + refresh tokens:** stateless, but revocation is complex, and storing tokens in the browser invites XSS theft. No benefit for a same-origin monolith.
- **Third-party auth library or service:** reduces code, but adds a dependency or a hosted service (cost or privacy). Revisit for OAuth or social login after MVP.
- **bcrypt:** acceptable, but argon2id is the current OWASP-recommended default.

## Rationale
This is the simplest secure option for a same-origin app. It gives immediate revocation and avoids storing tokens in browser JavaScript.

## Consequences
- There is one DB lookup per request (it can be cached later).
- Sessions live in Postgres, so horizontal scaling works without sticky sessions.

## Security and operational implications
`COOKIE_SECURE=true` and HTTPS are required in production. Expired sessions are cleaned up periodically. Login is rate-limited.
