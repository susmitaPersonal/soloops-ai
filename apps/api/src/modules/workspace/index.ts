// Public API of the workspace module. Other modules import only from this file.
export { createWorkspaceService, type AiProviderInfo, type WorkspaceService } from './service';
export { createWorkspaceRoutes } from './routes';
export { requireMembership } from './membership';
export type { MembershipDoc, WorkspaceDoc } from './documents';
