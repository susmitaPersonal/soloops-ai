import type {
  loginRequestSchema,
  registerRequestSchema,
  SessionResponse,
} from '@soloops/contracts';
import type { z } from 'zod';
import type { AppConfig } from '../../platform/config';
import type { Clock } from '../../platform/clock';
import { DuplicateKeyError, type Database } from '../../platform/db';
import { errors } from '../../platform/errors';
import type { AuthUser } from '../../platform/http/types';
import { newId } from '../../platform/ids';
import type { WorkspaceService } from '../workspace';
import { toUserDto, type SessionDoc } from './documents';
import type { PasswordHasher } from './domain/password';
import {
  absoluteExpiry,
  generateSessionToken,
  hashSessionToken,
  isSessionActive,
  nextExpiry,
} from './domain/session-token';
import { createIdentityRepository } from './repository';

type RegisterInput = z.output<typeof registerRequestSchema>;
type LoginInput = z.output<typeof loginRequestSchema>;

/** Avoids a write on every request: the sliding expiry is refreshed at most once a minute. */
const TOUCH_INTERVAL_MS = 60_000;

export interface IssuedSession {
  token: string;
  response: SessionResponse;
}

export function createIdentityService(deps: {
  db: Database;
  clock: Clock;
  config: Pick<AppConfig, 'SESSION_IDLE_DAYS' | 'SESSION_ABSOLUTE_DAYS'>;
  hasher: PasswordHasher;
  workspaces: WorkspaceService;
}) {
  const repo = createIdentityRepository(deps.db);

  async function issueSession(userId: string): Promise<string> {
    const now = deps.clock.now();
    const token = generateSessionToken();
    const absoluteExpiresAt = absoluteExpiry(now, deps.config.SESSION_ABSOLUTE_DAYS);
    const doc: SessionDoc = {
      _id: hashSessionToken(token),
      userId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: nextExpiry(now, deps.config.SESSION_IDLE_DAYS, absoluteExpiresAt),
      absoluteExpiresAt,
    };
    await repo.insertSession(doc);
    return token;
  }

  async function sessionResponse(userId: string): Promise<SessionResponse> {
    const user = await repo.findUserById(userId);
    if (!user) throw errors.unauthenticated();
    return {
      user: toUserDto(user),
      workspaces: await deps.workspaces.listWorkspacesForUser(userId),
    };
  }

  return {
    /** FR-001, FR-003, AC-001.1–.2: user + workspace + OWNER membership in one transaction, then sign in. */
    async register(input: RegisterInput, previousToken?: string): Promise<IssuedSession> {
      const passwordHash = await deps.hasher.hash(input.password);
      const now = deps.clock.now();
      const userId = newId();
      const workspaceName = (input.workspaceName ?? `${input.name}'s workspace`).slice(0, 120);
      try {
        await deps.db.withTransaction(async (tx) => {
          await repo.insertUser(
            {
              _id: userId,
              email: input.email,
              name: input.name,
              passwordHash,
              createdAt: now,
              updatedAt: now,
            },
            tx,
          );
          await deps.workspaces.createWorkspaceForOwner(tx, {
            ownerUserId: userId,
            name: workspaceName,
            legalName: input.name.slice(0, 160),
          });
        });
      } catch (err) {
        // AC-001.2: a duplicate email gets the same generic error as any other refusal.
        if (err instanceof DuplicateKeyError) throw errors.registrationFailed();
        throw err;
      }
      // SEC-002: registering while signed in ends the previous session (no session left behind).
      if (previousToken) await repo.deleteSession(hashSessionToken(previousToken));
      const token = await issueSession(userId);
      return { token, response: await sessionResponse(userId) };
    },

    /** FR-002, AC-001.3, SEC-002: generic failure, constant-ish timing, session rotation on login. */
    async login(input: LoginInput, previousToken: string | undefined): Promise<IssuedSession> {
      const user = await repo.findUserByEmail(input.email);
      if (!user) {
        await deps.hasher.verifyDummy(input.password);
        throw errors.invalidCredentials();
      }
      if (!(await deps.hasher.verify(user.passwordHash, input.password))) {
        throw errors.invalidCredentials();
      }
      if (previousToken) await repo.deleteSession(hashSessionToken(previousToken));
      const token = await issueSession(user._id);
      return { token, response: await sessionResponse(user._id) };
    },

    /** AC-001.4: deletes the session server-side. */
    async logout(token: string | undefined): Promise<void> {
      if (token) await repo.deleteSession(hashSessionToken(token));
    },

    /** Resolves a cookie token to the signed-in user, enforcing idle and absolute expiry (SEC-002). */
    async authenticate(token: string): Promise<AuthUser | null> {
      const sessionId = hashSessionToken(token);
      const session = await repo.findSession(sessionId);
      if (!session) return null;
      const now = deps.clock.now();
      if (!isSessionActive(session, now)) {
        await repo.deleteSession(sessionId);
        return null;
      }
      const user = await repo.findUserById(session.userId);
      if (!user) return null;
      if (now.getTime() - session.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
        await repo.touchSession(
          sessionId,
          now,
          nextExpiry(now, deps.config.SESSION_IDLE_DAYS, session.absoluteExpiresAt),
        );
      }
      return { id: user._id, name: user.name, email: user.email, sessionId };
    },

    sessionResponse,
  };
}

export type IdentityService = ReturnType<typeof createIdentityService>;
