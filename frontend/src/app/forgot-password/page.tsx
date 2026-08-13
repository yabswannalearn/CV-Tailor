"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, getApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_URL}/auth/password-reset/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (!res.ok) throw new Error(await getApiError(res, "We couldn’t request a password reset. Please try again."));
      const data = await res.json();
      setMessage(data.message);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "We couldn’t request a password reset."); }
    finally { setLoading(false); }
  };

  return (
    <main className="min-h-screen bg-[#f5f2ed] px-6 py-16 font-mono text-[#1a1814]">
      <div className="mx-auto w-full max-w-sm">
        <button onClick={() => router.push("/login")} className="mb-10 text-[10px] uppercase tracking-[0.3em] text-[#5a8a00]">← sign in</button>
        <h1 className="text-3xl font-bold" style={{ fontFamily: "Georgia, serif" }}>Reset password.</h1>
        <p className="mt-2 text-sm text-[#7a7570]">We’ll send a secure reset link to your email.</p>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" className="mt-8 w-full rounded-sm border border-[#d4cfc7] bg-[#e8e4dd] p-3 text-sm outline-none" />
        {message && <div className="mt-4 rounded-sm border border-[#8ab030] bg-[#e8f5c0] px-4 py-3 text-xs text-[#3d6600]">{message}</div>}
        {error && <div className="mt-4 rounded-sm border border-[#ffcccc] bg-[#ffeaea] px-4 py-3 text-xs text-[#cc3333]">✗ {error}</div>}
        <button onClick={submit} disabled={loading || !email.trim()} className="mt-5 w-full rounded-sm bg-[#1a1814] py-3 text-sm font-bold uppercase tracking-[0.15em] text-[#f5f2ed] disabled:bg-[#d4cfc7]">{loading ? "Sending..." : "Send reset link"}</button>
      </div>
    </main>
  );
}
