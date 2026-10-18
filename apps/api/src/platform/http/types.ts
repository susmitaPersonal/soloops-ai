import type { Role } from '@soloops/contracts';

/** The authenticated user, resolved from the session cookie (identity module). */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  /** SHA-256 of the session token (the stored session `_id`). */
  sessionId: string;
}

/** Per-request tenant context set by `requireMembership` (backend-architecture.md#workspace-authorisation). */
export interface TenantCtx {
  userId: string;
  workspaceId: string;
  role: Role;
  requestId: string;
}

export interface AppEnv {
  Variables: {
    requestId: string;
    user: AuthUser | undefined;
    ctx: TenantCtx;
  };
}
