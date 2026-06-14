import type { NextConfig } from "next";

// API paths are proxied server-side to the in-cluster API service so the whole app
// is served from a single Tailscale origin (no CORS, and no Tailscale-serve prefix
// stripping). The destination is resolved at build time; override with INCY_API_ORIGIN.
const API_ORIGIN =
  process.env.INCY_API_ORIGIN || "http://incy-api.incy.svc.cluster.local:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      { source: "/v1/:path*", destination: `${API_ORIGIN}/v1/:path*` },
      { source: "/health", destination: `${API_ORIGIN}/health` },
      { source: "/docs", destination: `${API_ORIGIN}/docs` },
      { source: "/openapi.json", destination: `${API_ORIGIN}/openapi.json` },
      { source: "/redoc", destination: `${API_ORIGIN}/redoc` },
    ];
  },
};

export default nextConfig;
