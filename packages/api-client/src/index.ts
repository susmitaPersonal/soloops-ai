import {
  CSRF_HEADER_NAME,
  CSRF_HEADER_VALUE,
  aiStatusSchema,
  analysisResponseSchema,
  apiPaths,
  baselineDtoSchema,
  convertToTasksResponseSchema,
  invoiceDtoSchema,
  invoiceListResponseSchema,
  type CreateInvoiceRequest,
  type InvoiceDto,
  type InvoiceListResponse,
  type InvoiceStatus,
  type UpdateInvoiceRequest,
  type VoidInvoiceRequest,
  entryDtoSchema,
  entryListResponseSchema,
  projectOverviewSchema,
  type ConvertToTasksRequest,
  type ConvertToTasksResponse,
  type CreateEntryRequest,
  type EntryDto,
  type EntryListResponse,
  type ProjectOverview,
  type UpdateEntryRequest,
  changeRequestDetailSchema,
  changeRequestDtoSchema,
  changeRequestListResponseSchema,
  proposalSummarySchema,
  recordDecisionResponseSchema,
  versionDiffSchema,
  baselineListResponseSchema,
  clientDtoSchema,
  clientListResponseSchema,
  problemSchema,
  projectDtoSchema,
  projectListResponseSchema,
  requirementDtoSchema,
  requirementListResponseSchema,
  sessionResponseSchema,
  taskDtoSchema,
  taskListResponseSchema,
  workspaceSettingsDtoSchema,
  type AiEnablementRequest,
  type AiStatus,
  type AnalysisResponse,
  type BaselineDto,
  type ChangeRequestDetail,
  type ChangeRequestDto,
  type ChangeRequestListResponse,
  type CreateChangeRequest,
  type ProposalSummary,
  type RecordDecisionRequest,
  type RecordDecisionResponse,
  type UpdateVersionRequest,
  type VersionDiff,
  type BaselineListResponse,
  type ClientDto,
  type ClientListResponse,
  type CreateClientRequest,
  type CreateProjectRequest,
  type CreateRequirementRequest,
  type CreateTaskRequest,
  type ProjectDto,
  type ProjectListResponse,
  type RequirementDto,
  type RequirementListResponse,
  type TaskDto,
  type TaskListResponse,
  type UpdateClientRequest,
  type UpdateProjectRequest,
  type UpdateRequirementRequest,
  type UpdateTaskRequest,
  type FieldError,
  type LoginRequest,
  type Problem,
  type ProblemCode,
  type RegisterRequest,
  type SessionResponse,
  type UpdateWorkspaceSettingsRequest,
  type WorkspaceSettingsDto,
  type ZodType,
  type Infer,
} from '@soloops/contracts';

/** An API error carrying the server's problem+json body (RFC 9457). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ProblemCode | 'NETWORK_ERROR' | 'INVALID_RESPONSE';
  readonly errors: FieldError[];
  readonly requestId: string | undefined;

  constructor(status: number, problem: Pick<Problem, 'code' | 'title'> & Partial<Problem>) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
    this.status = status;
    this.code = problem.code;
    this.errors = problem.errors ?? [];
    this.requestId = problem.requestId;
  }
}

export class ClientError extends Error {
  readonly status: number;
  readonly code: 'NETWORK_ERROR' | 'INVALID_RESPONSE';
  constructor(code: 'NETWORK_ERROR' | 'INVALID_RESPONSE', message: string, status = 0) {
    super(message);
    this.name = 'ClientError';
    this.code = code;
    this.status = status;
  }
}

export interface ApiClientOptions {
  /** '' for same-origin browser calls; API_INTERNAL_URL on the Next.js server. */
  baseUrl: string;
  fetch?: typeof fetch;
  /** Extra headers on every request (e.g. forwarded Cookie and X-Request-Id on the server). */
  headers?: Record<string, string>;
}

export interface RequestOptions {
  ifMatch?: number | string;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface Versioned<T> {
  data: T;
  etag: string | null;
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Whitelisted list filters (api-design §1). Undefined values are omitted. */
export type ListParams = Record<string, string | number | boolean | undefined>;

function withQuery(path: string, params: ListParams = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

export function createApiClient(options: ApiClientOptions) {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

  async function request<S extends ZodType | null>(
    method: string,
    path: string,
    schema: S,
    body?: unknown,
    opts: RequestOptions = {},
  ): Promise<Versioned<S extends ZodType ? Infer<S> : null>> {
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    if (UNSAFE.has(method)) headers[CSRF_HEADER_NAME] = CSRF_HEADER_VALUE;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.ifMatch !== undefined) headers['If-Match'] = `"${opts.ifMatch}"`;
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

    let res: Response;
    try {
      res = await doFetch(`${options.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'include',
        cache: 'no-store',
        signal: opts.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      throw new ClientError('NETWORK_ERROR', 'Could not reach the server. Check your connection.');
    }

    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        throw new ClientError(
          'INVALID_RESPONSE',
          'The server sent an unreadable response.',
          res.status,
        );
      }
    }

    if (!res.ok) {
      const parsed = problemSchema.safeParse(json);
      if (parsed.success) throw new ApiError(res.status, parsed.data);
      throw new ClientError(
        'INVALID_RESPONSE',
        `Request failed with status ${res.status}.`,
        res.status,
      );
    }

    const etag = res.headers.get('ETag');
    if (schema === null) return { data: null as never, etag };
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ClientError(
        'INVALID_RESPONSE',
        'The server response did not match the contract.',
        res.status,
      );
    }
    return { data: parsed.data as never, etag };
  }

  return {
    request,
    auth: {
      register: async (body: RegisterRequest): Promise<SessionResponse> =>
        (await request('POST', apiPaths.register(), sessionResponseSchema, body)).data,
      login: async (body: LoginRequest): Promise<SessionResponse> =>
        (await request('POST', apiPaths.login(), sessionResponseSchema, body)).data,
      logout: async (): Promise<void> => {
        await request('POST', apiPaths.logout(), null);
      },
      me: async (): Promise<SessionResponse> =>
        (await request('GET', apiPaths.me(), sessionResponseSchema)).data,
    },
    workspaces: {
      get: async (workspaceId: string): Promise<Versioned<WorkspaceSettingsDto>> =>
        request('GET', apiPaths.workspace(workspaceId), workspaceSettingsDtoSchema),
      update: async (
        workspaceId: string,
        body: UpdateWorkspaceSettingsRequest,
        rowVersion: number,
      ): Promise<Versioned<WorkspaceSettingsDto>> =>
        request('PATCH', apiPaths.workspace(workspaceId), workspaceSettingsDtoSchema, body, {
          ifMatch: rowVersion,
        }),
    },
    // Core Ops (FR-010–FR-014)
    clients: {
      list: async (
        ws: string,
        params: { archived?: boolean; limit?: number; cursor?: string } = {},
      ): Promise<ClientListResponse> =>
        (await request('GET', withQuery(apiPaths.clients(ws), params), clientListResponseSchema))
          .data,
      get: async (ws: string, id: string): Promise<Versioned<ClientDto>> =>
        request('GET', apiPaths.client(ws, id), clientDtoSchema),
      create: async (ws: string, body: CreateClientRequest): Promise<ClientDto> =>
        (await request('POST', apiPaths.clients(ws), clientDtoSchema, body)).data,
      update: async (
        ws: string,
        id: string,
        body: UpdateClientRequest,
        rowVersion: number,
      ): Promise<ClientDto> =>
        (
          await request('PATCH', apiPaths.client(ws, id), clientDtoSchema, body, {
            ifMatch: rowVersion,
          })
        ).data,
      archive: async (ws: string, id: string): Promise<ClientDto> =>
        (await request('POST', apiPaths.clientArchive(ws, id), clientDtoSchema)).data,
    },
    projects: {
      /** FR-015 / AC-024.1: server-computed counts and the eligible unbilled total. */
      overview: async (ws: string, projectId: string): Promise<ProjectOverview> =>
        (await request('GET', apiPaths.projectOverview(ws, projectId), projectOverviewSchema)).data,
      list: async (
        ws: string,
        params: { archived?: boolean; clientId?: string; limit?: number; cursor?: string } = {},
      ): Promise<ProjectListResponse> =>
        (await request('GET', withQuery(apiPaths.projects(ws), params), projectListResponseSchema))
          .data,
      get: async (ws: string, id: string): Promise<Versioned<ProjectDto>> =>
        request('GET', apiPaths.project(ws, id), projectDtoSchema),
      create: async (ws: string, body: CreateProjectRequest): Promise<ProjectDto> =>
        (await request('POST', apiPaths.projects(ws), projectDtoSchema, body)).data,
      update: async (
        ws: string,
        id: string,
        body: UpdateProjectRequest,
        rowVersion: number,
      ): Promise<ProjectDto> =>
        (
          await request('PATCH', apiPaths.project(ws, id), projectDtoSchema, body, {
            ifMatch: rowVersion,
          })
        ).data,
      archive: async (ws: string, id: string): Promise<ProjectDto> =>
        (await request('POST', apiPaths.projectArchive(ws, id), projectDtoSchema)).data,
    },
    requirements: {
      list: async (ws: string, projectId: string): Promise<RequirementListResponse> =>
        (
          await request(
            'GET',
            apiPaths.projectRequirements(ws, projectId),
            requirementListResponseSchema,
          )
        ).data,
      create: async (
        ws: string,
        projectId: string,
        body: CreateRequirementRequest,
      ): Promise<RequirementDto> =>
        (
          await request(
            'POST',
            apiPaths.projectRequirements(ws, projectId),
            requirementDtoSchema,
            body,
          )
        ).data,
      update: async (
        ws: string,
        id: string,
        body: UpdateRequirementRequest,
        rowVersion: number,
      ): Promise<RequirementDto> =>
        (
          await request('PATCH', apiPaths.requirement(ws, id), requirementDtoSchema, body, {
            ifMatch: rowVersion,
          })
        ).data,
      delete: async (ws: string, id: string): Promise<void> => {
        await request('DELETE', apiPaths.requirement(ws, id), null);
      },
    },
    baselines: {
      list: async (ws: string, projectId: string): Promise<BaselineListResponse> =>
        (await request('GET', apiPaths.projectBaselines(ws, projectId), baselineListResponseSchema))
          .data,
      create: async (ws: string, projectId: string): Promise<BaselineDto> =>
        (await request('POST', apiPaths.projectBaselines(ws, projectId), baselineDtoSchema)).data,
    },
    tasks: {
      list: async (
        ws: string,
        projectId: string,
        params: { status?: string; assigneeUserId?: string; limit?: number; cursor?: string } = {},
      ): Promise<TaskListResponse> =>
        (
          await request(
            'GET',
            withQuery(apiPaths.projectTasks(ws, projectId), params),
            taskListResponseSchema,
          )
        ).data,
      get: async (ws: string, id: string): Promise<Versioned<TaskDto>> =>
        request('GET', apiPaths.task(ws, id), taskDtoSchema),
      create: async (ws: string, projectId: string, body: CreateTaskRequest): Promise<TaskDto> =>
        (await request('POST', apiPaths.projectTasks(ws, projectId), taskDtoSchema, body)).data,
      update: async (
        ws: string,
        id: string,
        body: UpdateTaskRequest,
        rowVersion: number,
      ): Promise<TaskDto> =>
        (
          await request('PATCH', apiPaths.task(ws, id), taskDtoSchema, body, {
            ifMatch: rowVersion,
          })
        ).data,
    },
    // Scope Guard (FR-020–FR-032)
    changeRequests: {
      listForProject: async (
        ws: string,
        projectId: string,
        params: { status?: string; limit?: number; cursor?: string } = {},
      ): Promise<ChangeRequestListResponse> =>
        (
          await request(
            'GET',
            withQuery(apiPaths.projectChangeRequests(ws, projectId), params),
            changeRequestListResponseSchema,
          )
        ).data,
      queue: async (
        ws: string,
        params: { status?: string; projectId?: string; limit?: number; cursor?: string } = {},
      ): Promise<ChangeRequestListResponse> =>
        (
          await request(
            'GET',
            withQuery(apiPaths.changeRequests(ws), params),
            changeRequestListResponseSchema,
          )
        ).data,
      get: async (ws: string, crId: string): Promise<ChangeRequestDetail> =>
        (await request('GET', apiPaths.changeRequest(ws, crId), changeRequestDetailSchema)).data,
      create: async (
        ws: string,
        projectId: string,
        body: CreateChangeRequest,
      ): Promise<ChangeRequestDto> =>
        (
          await request(
            'POST',
            apiPaths.projectChangeRequests(ws, projectId),
            changeRequestDtoSchema,
            body,
          )
        ).data,
      updateDraft: async (
        ws: string,
        crId: string,
        n: number,
        body: UpdateVersionRequest,
        rowVersion: number,
      ): Promise<ChangeRequestDto> =>
        (
          await request('PATCH', apiPaths.crVersion(ws, crId, n), changeRequestDtoSchema, body, {
            ifMatch: rowVersion,
          })
        ).data,
      discardDraft: async (ws: string, crId: string, n: number): Promise<ChangeRequestDto> =>
        (await request('DELETE', apiPaths.crVersion(ws, crId, n), changeRequestDtoSchema)).data,
      newVersion: async (
        ws: string,
        crId: string,
        idempotencyKey?: string,
      ): Promise<ChangeRequestDto> =>
        (
          await request('POST', apiPaths.crVersions(ws, crId), changeRequestDtoSchema, undefined, {
            ...(idempotencyKey ? { idempotencyKey } : {}),
          })
        ).data,
      propose: async (
        ws: string,
        crId: string,
        n: number,
        rowVersion: number,
        idempotencyKey?: string,
      ): Promise<ChangeRequestDto> =>
        (
          await request(
            'POST',
            apiPaths.crVersionAction(ws, crId, n, 'propose'),
            changeRequestDtoSchema,
            undefined,
            { ifMatch: rowVersion, ...(idempotencyKey ? { idempotencyKey } : {}) },
          )
        ).data,
      withdraw: async (
        ws: string,
        crId: string,
        n: number,
        idempotencyKey?: string,
      ): Promise<ChangeRequestDto> =>
        (
          await request(
            'POST',
            apiPaths.crVersionAction(ws, crId, n, 'withdraw'),
            changeRequestDtoSchema,
            undefined,
            { ...(idempotencyKey ? { idempotencyKey } : {}) },
          )
        ).data,
      /** FR-025: the Idempotency-Key is required (api-design §4). */
      recordDecision: async (
        ws: string,
        crId: string,
        n: number,
        body: RecordDecisionRequest,
        idempotencyKey: string,
      ): Promise<RecordDecisionResponse> =>
        (
          await request(
            'POST',
            apiPaths.crVersionAction(ws, crId, n, 'decisions'),
            recordDecisionResponseSchema,
            body,
            { idempotencyKey },
          )
        ).data,
      analyze: async (
        ws: string,
        crId: string,
        n: number,
        signal?: AbortSignal,
      ): Promise<AnalysisResponse> =>
        (
          await request(
            'POST',
            apiPaths.crVersionAction(ws, crId, n, 'analyze'),
            analysisResponseSchema,
            undefined,
            { ...(signal ? { signal } : {}) },
          )
        ).data,
      summary: async (ws: string, crId: string, n: number): Promise<ProposalSummary> =>
        (
          await request(
            'GET',
            apiPaths.crVersionAction(ws, crId, n, 'summary'),
            proposalSummarySchema,
          )
        ).data,
      diff: async (ws: string, crId: string, from: number, to: number): Promise<VersionDiff> =>
        (await request('GET', apiPaths.crDiff(ws, crId, from, to), versionDiffSchema)).data,
      /** FR-030: tasks from an APPROVED version's acceptance criteria (duplicates are skipped). */
      convertToTasks: async (
        ws: string,
        crId: string,
        n: number,
        body: ConvertToTasksRequest,
        idempotencyKey?: string,
      ): Promise<ConvertToTasksResponse> =>
        (
          await request(
            'POST',
            apiPaths.crVersionAction(ws, crId, n, 'tasks'),
            convertToTasksResponseSchema,
            body,
            { ...(idempotencyKey ? { idempotencyKey } : {}) },
          )
        ).data,
    },
    // Delivery and billable work (FR-040, FR-041, FR-015)
    billableEntries: {
      /** Eligibility and amounts are computed by the server (BR-016, AC-018.2). */
      list: async (
        ws: string,
        projectId: string,
        params: { state?: 'unbilled' | 'all' } = {},
      ): Promise<EntryListResponse> =>
        (
          await request(
            'GET',
            withQuery(apiPaths.projectEntries(ws, projectId), params),
            entryListResponseSchema,
          )
        ).data,
      create: async (
        ws: string,
        projectId: string,
        body: CreateEntryRequest,
        idempotencyKey?: string,
      ): Promise<EntryDto> =>
        (
          await request('POST', apiPaths.projectEntries(ws, projectId), entryDtoSchema, body, {
            ...(idempotencyKey ? { idempotencyKey } : {}),
          })
        ).data,
      update: async (
        ws: string,
        id: string,
        body: UpdateEntryRequest,
        rowVersion: number,
      ): Promise<EntryDto> =>
        (
          await request('PATCH', apiPaths.entry(ws, id), entryDtoSchema, body, {
            ifMatch: rowVersion,
          })
        ).data,
      delete: async (ws: string, id: string): Promise<void> => {
        await request('DELETE', apiPaths.entry(ws, id), null);
      },
    },
    // Invoices (FR-042–FR-046). Totals are always the server's (BR-020).
    invoices: {
      list: async (
        ws: string,
        params: {
          status?: InvoiceStatus;
          projectId?: string;
          limit?: number;
          cursor?: string;
        } = {},
      ): Promise<InvoiceListResponse> =>
        (await request('GET', withQuery(apiPaths.invoices(ws), params), invoiceListResponseSchema))
          .data,
      get: async (ws: string, id: string): Promise<InvoiceDto> =>
        (await request('GET', apiPaths.invoice(ws, id), invoiceDtoSchema)).data,
      create: async (
        ws: string,
        body: CreateInvoiceRequest,
        idempotencyKey?: string,
      ): Promise<InvoiceDto> =>
        (
          await request('POST', apiPaths.invoices(ws), invoiceDtoSchema, body, {
            ...(idempotencyKey ? { idempotencyKey } : {}),
          })
        ).data,
      update: async (
        ws: string,
        id: string,
        body: UpdateInvoiceRequest,
        rowVersion: number,
      ): Promise<InvoiceDto> =>
        (
          await request('PATCH', apiPaths.invoice(ws, id), invoiceDtoSchema, body, {
            ifMatch: rowVersion,
          })
        ).data,
      delete: async (ws: string, id: string): Promise<void> => {
        await request('DELETE', apiPaths.invoice(ws, id), null);
      },
      /** FR-044, owner only. The Idempotency-Key is required (AC-020.3). */
      issue: async (ws: string, id: string, idempotencyKey: string): Promise<InvoiceDto> =>
        (
          await request(
            'POST',
            apiPaths.invoiceAction(ws, id, 'issue'),
            invoiceDtoSchema,
            undefined,
            {
              idempotencyKey,
            },
          )
        ).data,
      /** FR-046, owner only. */
      void: async (
        ws: string,
        id: string,
        body: VoidInvoiceRequest,
        idempotencyKey: string,
      ): Promise<InvoiceDto> =>
        (
          await request('POST', apiPaths.invoiceAction(ws, id, 'void'), invoiceDtoSchema, body, {
            idempotencyKey,
          })
        ).data,
    },
    ai: {
      status: async (ws: string): Promise<AiStatus> =>
        (await request('GET', apiPaths.aiStatus(ws), aiStatusSchema)).data,
      setEnablement: async (ws: string, body: AiEnablementRequest): Promise<WorkspaceSettingsDto> =>
        (await request('PUT', apiPaths.aiEnablement(ws), workspaceSettingsDtoSchema, body)).data,
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
