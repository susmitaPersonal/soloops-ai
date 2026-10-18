/** API route paths, relative to the site origin (ADR-0013). */
export const API_PREFIX = '/api/v1';

const enc = encodeURIComponent;
const tenant = (workspaceId: string) => `${API_PREFIX}/workspaces/${enc(workspaceId)}`;

export const apiPaths = {
  register: () => `${API_PREFIX}/auth/register`,
  login: () => `${API_PREFIX}/auth/login`,
  logout: () => `${API_PREFIX}/auth/logout`,
  me: () => `${API_PREFIX}/auth/me`,
  workspace: (workspaceId: string) => `${API_PREFIX}/workspaces/${encodeURIComponent(workspaceId)}`,
  clients: (ws: string) => `${tenant(ws)}/clients`,
  client: (ws: string, clientId: string) => `${tenant(ws)}/clients/${enc(clientId)}`,
  clientArchive: (ws: string, clientId: string) => `${tenant(ws)}/clients/${enc(clientId)}/archive`,
  projects: (ws: string) => `${tenant(ws)}/projects`,
  project: (ws: string, projectId: string) => `${tenant(ws)}/projects/${enc(projectId)}`,
  projectArchive: (ws: string, projectId: string) =>
    `${tenant(ws)}/projects/${enc(projectId)}/archive`,
  projectRequirements: (ws: string, projectId: string) =>
    `${tenant(ws)}/projects/${enc(projectId)}/requirements`,
  requirement: (ws: string, requirementId: string) =>
    `${tenant(ws)}/requirements/${enc(requirementId)}`,
  projectBaselines: (ws: string, projectId: string) =>
    `${tenant(ws)}/projects/${enc(projectId)}/baselines`,
  projectTasks: (ws: string, projectId: string) => `${tenant(ws)}/projects/${enc(projectId)}/tasks`,
  task: (ws: string, taskId: string) => `${tenant(ws)}/tasks/${enc(taskId)}`,
  projectChangeRequests: (ws: string, projectId: string) =>
    `${tenant(ws)}/projects/${enc(projectId)}/change-requests`,
  changeRequests: (ws: string) => `${tenant(ws)}/change-requests`,
  changeRequest: (ws: string, crId: string) => `${tenant(ws)}/change-requests/${enc(crId)}`,
  crVersions: (ws: string, crId: string) => `${tenant(ws)}/change-requests/${enc(crId)}/versions`,
  crVersion: (ws: string, crId: string, n: number) =>
    `${tenant(ws)}/change-requests/${enc(crId)}/versions/${n}`,
  crVersionAction: (
    ws: string,
    crId: string,
    n: number,
    action: 'analyze' | 'propose' | 'withdraw' | 'decisions' | 'tasks' | 'summary',
  ) => `${tenant(ws)}/change-requests/${enc(crId)}/versions/${n}/${action}`,
  crDiff: (ws: string, crId: string, from: number, to: number) =>
    `${tenant(ws)}/change-requests/${enc(crId)}/diff?from=${from}&to=${to}`,
  aiStatus: (ws: string) => `${tenant(ws)}/ai/status`,
  projectEntries: (ws: string, projectId: string) =>
    `${tenant(ws)}/projects/${enc(projectId)}/billable-entries`,
  entry: (ws: string, entryId: string) => `${tenant(ws)}/billable-entries/${enc(entryId)}`,
  projectOverview: (ws: string, projectId: string) =>
    `${tenant(ws)}/projects/${enc(projectId)}/overview`,
  aiEnablement: (ws: string) => `${tenant(ws)}/ai-enablement`,
  invoices: (ws: string) => `${tenant(ws)}/invoices`,
  invoice: (ws: string, invoiceId: string) => `${tenant(ws)}/invoices/${enc(invoiceId)}`,
  invoiceAction: (ws: string, invoiceId: string, action: 'issue' | 'void') =>
    `${tenant(ws)}/invoices/${enc(invoiceId)}/${action}`,
} as const;
