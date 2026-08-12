"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, getApiError } from "@/lib/api";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => setToken(new URLSearchParams(window.location.search).get("token") || ""), []);

  const submit = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_URL}/auth/password-reset/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      if (!res.ok) throw new Error(await getApiError(res, "We couldn’t reset your password. Please request a new link."));
      const data = await res.json();
      setMessage(data.message); setTimeout(() => router.push("/login"), 1500);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "We couldn’t reset your password."); }
    finally { setLoading(false); }
  };

  return (
    <main className="min-h-screen bg-[#f5f2ed] px-6 py-16 font-mono text-[#1a1814]">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-3xl font-bold" style={{ fontFamily: "Georgia, serif" }}>Choose a new password.</h1>
        <p className="mt-2 text-sm text-[#7a7570]">Use at least 8 characters.</p>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="New password" className="mt-8 w-full rounded-sm border border-[#d4cfc7] bg-[#e8e4dd] p-3 text-sm outline-none" />
        {message && <div className="mt-4 rounded-sm border border-[#8ab030] bg-[#e8f5c0] px-4 py-3 text-xs text-[#3d6600]">{message}</div>}
        {error && <div className="mt-4 rounded-sm border border-[#ffcccc] bg-[#ffeaea] px-4 py-3 text-xs text-[#cc3333]">✗ {error}</div>}
        <button onClick={submit} disabled={loading || !token || password.length < 8} className="mt-5 w-full rounded-sm bg-[#1a1814] py-3 text-sm font-bold uppercase tracking-[0.15em] text-[#f5f2ed] disabled:bg-[#d4cfc7]">{loading ? "Saving..." : "Reset password"}</button>
      </div>
    </main>
  );
}
