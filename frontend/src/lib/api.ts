// Dynamically detect Vercel production to force /api proxy path and bypass env cache
export const API_URL = typeof window !== "undefined" && window.location.hostname.includes("vercel.app")
  ? "/api"
  : process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
