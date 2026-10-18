import { createApiClient } from '@soloops/api-client';

/** Client Component API access (ADR-0013 §2): same-origin relative URLs; the client adds the CSRF header. */
export const browserApi = createApiClient({ baseUrl: '' });
