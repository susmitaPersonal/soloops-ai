import type { NextConfig } from 'next';

const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // ADR-0011 §5: internal packages are consumed as TypeScript source.
  transpilePackages: ['@soloops/contracts', '@soloops/api-client'],
  // ADR-0013: the browser always calls same-origin /api/*. In development (and simple
  // self-hosted runs) Next.js forwards it to the API; in production a reverse proxy does.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiInternalUrl}/api/:path*` }];
  },
  // Static security headers; the nonce-based CSP is set per request in src/proxy.ts.
  async headers() {
    const headers = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ];
    if (process.env.NODE_ENV === 'production') {
      headers.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains',
      });
    }
    return [{ source: '/:path*', headers }];
  },
};

export default nextConfig;
