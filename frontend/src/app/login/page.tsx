"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, getApiError } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { queryKeys, warmAuthenticatedData } from "@/lib/queries";

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`;

const inputClass = "w-full bg-[#e8e4dd] text-[#1a1814] text-sm p-3 outline-none border border-[#d4cfc7] focus:border-[#c8f06088] rounded-sm placeholder-[#b0aba4] transition-colors duration-200";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, remember_me: rememberMe }),
      });

      if (!res.ok) {
        throw new Error(await getApiError(res, "We couldn’t sign you in. Please check your details and try again."));
      }

      queryClient.removeQueries({ queryKey: queryKeys.authenticated });
      router.push("/dashboard");
      void warmAuthenticatedData(queryClient);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "We couldn’t sign you in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f5f2ed] text-[#1a1814] font-mono flex items-center justify-center px-6">
      <div className="pointer-events-none fixed inset-0 opacity-[0.07] z-0"
        style={{ backgroundImage: GRAIN, backgroundRepeat: "repeat", backgroundSize: "128px" }} />

      <div className="relative z-10 w-full max-w-sm">

        <div className="mb-10">
          <button onClick={() => router.push("/")}
            className="text-[10px] tracking-[0.3em] text-[#5a8a00] uppercase mb-6 block hover:opacity-70 transition-opacity">
            ← cv_tailor
          </button>
          <h1 className="text-3xl font-bold text-[#1a1814]"
            style={{ fontFamily: "'Georgia', serif", letterSpacing: "-0.02em" }}>
            Welcome back.
          </h1>
          <p className="text-[#7a7570] text-sm mt-2">Enter your email and password to continue.</p>
        </div>

        <div className="relative mb-6">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-[#c8f060] via-[#c8f06044] to-transparent" />
          <label className="block text-[10px] tracking-[0.25em] text-[#7a7570] uppercase mb-3 mt-4">
            Email
          </label>
          <input
            type="email"
            className={inputClass}
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
          
          <label className="block text-[10px] tracking-[0.25em] text-[#7a7570] uppercase mb-3 mt-4">
            Password
          </label>
          <input
            type="password"
            className={inputClass}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />

          <label className="mt-4 flex cursor-pointer items-center gap-3 text-xs text-[#7a7570] select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[#5a8a00]"
            />
            <span>Remember me for 30 days</span>
          </label>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 bg-[#ffeaea] border border-[#ffcccc] text-[#cc3333] text-xs rounded-sm">
            ✗ {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading || !email.trim() || !password.trim()}
          className="w-full py-4 text-sm tracking-[0.15em] uppercase font-bold transition-all duration-200 rounded-sm disabled:cursor-not-allowed"
          style={{
            background: loading || !email.trim() || !password.trim() ? "#d4cfc7" : "#1a1814",
            color: loading || !email.trim() || !password.trim() ? "#b0aba4" : "#f5f2ed",
          }}
        >
          {loading ? "Signing in..." : "Sign In →"}
        </button>

        <button
          onClick={() => router.push("/forgot-password")}
          className="mt-4 block w-full text-center text-xs text-[#5a8a00] hover:opacity-70 transition-opacity"
        >
          Forgot your password?
        </button>

        <p className="mt-6 text-center text-[#b0aba4] text-xs">
          No account?{" "}
          <button onClick={() => router.push("/register")}
            className="text-[#5a8a00] hover:opacity-70 transition-opacity">
            Register
          </button>
        </p>
      </div>
    </main>
  );
}
