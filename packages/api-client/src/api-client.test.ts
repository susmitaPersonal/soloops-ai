import { describe, expect, it, vi } from 'vitest';
import { ApiError, ClientError, createApiClient } from './index';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const settings = {
  id: '0192a000-0000-7000-8000-000000000001',
  name: 'WS',
  defaultCurrency: 'INR',
  defaultHourlyRateMinor: '0',
  taxLabel: 'Tax',
  taxRateBps: 0,
  invoicePrefix: 'INV',
  timeZone: 'Asia/Kolkata',
  billingDetails: { legalName: 'R', address: null, taxId: null },
  aiEnabled: false,
  rowVersion: 3,
  myRole: 'OWNER',
};

describe('@soloops/api-client', () => {
  it('SEC-003 adds the CSRF header on mutations only, and If-Match when asked', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => json(200, settings, { ETag: '"4"' }));
    const client = createApiClient({ baseUrl: '', fetch });
    await client.workspaces.get(settings.id);
    const getHeaders = fetch.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(getHeaders['X-Requested-With']).toBeUndefined();

    const res = await client.workspaces.update(settings.id, { taxLabel: 'GST' }, 3);
    const init = fetch.mock.calls[1]?.[1];
    const headers = init?.headers as Record<string, string>;
    expect(init?.method).toBe('PATCH');
    expect(headers['X-Requested-With']).toBe('soloops');
    expect(headers['If-Match']).toBe('"3"');
    expect(init?.credentials).toBe('include');
    expect(init?.cache).toBe('no-store');
    expect(res.etag).toBe('"4"');
  });

  it('maps problem+json to ApiError with code, field errors and request ID', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      json(422, {
        type: 'urn:soloops:problem:validation-failed',
        title: 'Validation failed',
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [{ path: 'taxRateBps', message: 'Too high' }],
        requestId: 'r1',
      }),
    );
    const client = createApiClient({ baseUrl: '', fetch });
    const err = await client.workspaces
      .update(settings.id, { taxRateBps: 1 }, 1)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: 'VALIDATION_FAILED', requestId: 'r1' });
    expect((err as ApiError).errors).toEqual([{ path: 'taxRateBps', message: 'Too high' }]);
  });

  it('rejects responses that do not match the contract', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(json(200, { unexpected: true }));
    const client = createApiClient({ baseUrl: '', fetch });
    await expect(client.auth.me()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('reports network failures as ClientError NETWORK_ERROR', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('fetch failed'));
    const client = createApiClient({ baseUrl: '', fetch });
    const err = await client.auth.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ClientError);
    expect(err).toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('forwards configured headers and prefixes the base URL', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = createApiClient({
      baseUrl: 'http://api:4000',
      fetch,
      headers: { Cookie: 'soloops_sid=x' },
    });
    await client.auth.logout();
    expect(fetch.mock.calls[0]?.[0]).toBe('http://api:4000/api/v1/auth/logout');
    expect((fetch.mock.calls[0]?.[1]?.headers as Record<string, string>).Cookie).toBe(
      'soloops_sid=x',
    );
  });
});

describe('@soloops/api-client failure modes', () => {
  it('UT-CLI-01 an unreadable (non-JSON) body is INVALID_RESPONSE, never a crash', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('<html>502</html>', { status: 502 }));
    await expect(createApiClient({ baseUrl: '', fetch }).auth.me()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 502,
    });
  });

  it('UT-CLI-02 an error body that is not problem+json is INVALID_RESPONSE with the status', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(json(500, { message: 'oops' }));
    await expect(createApiClient({ baseUrl: '', fetch }).auth.me()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 500,
    });
  });

  it('UT-CLI-03 aborts propagate unchanged so callers can cancel (NFR-005)', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(abort);
    await expect(createApiClient({ baseUrl: '', fetch }).auth.me()).rejects.toBe(abort);
  });

  it('UT-CLI-04 sends Idempotency-Key when given and JSON content type only with a body', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => new Response(null, { status: 204 }));
    const client = createApiClient({ baseUrl: '', fetch });
    await client.request('POST', '/api/v1/x', null, undefined, { idempotencyKey: 'k-1' });
    const headers = fetch.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('k-1');
    expect(headers['Content-Type']).toBeUndefined();
    expect(fetch.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it('UT-CLI-05 login and register parse the session contract', async () => {
    const session = {
      user: { id: settings.id, name: 'R', email: 'r@example.com' },
      workspaces: [],
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => json(200, session));
    const client = createApiClient({ baseUrl: '', fetch });
    await expect(client.auth.login({ email: 'r@example.com', password: 'x' })).resolves.toEqual(
      session,
    );
    await expect(
      client.auth.register({
        name: 'R',
        email: 'r@example.com',
        password: 'correct horse battery',
      }),
    ).resolves.toEqual(session);
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      email: 'r@example.com',
      password: 'x',
    });
  });
});
