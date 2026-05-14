// Unconditionally use /api proxy path in production for both SSR and CSR
export const API_URL = process.env.NODE_ENV === "production"
  ? "/api"
  : process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
