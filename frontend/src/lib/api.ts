// Same-origin "/api" proxy (see rewrites in next.config.ts) so the session
// cookie stays first-party to the frontend. Override with NEXT_PUBLIC_API_URL.
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
