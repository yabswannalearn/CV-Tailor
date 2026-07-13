"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";

export default function VerifyPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Verifying your email...");
  const [error, setError] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setError(true); setMessage("This verification link is missing a token."); return; }
    fetch(`${API_URL}/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || "Verification failed.");
        setMessage(data.message || "Email verified. You can now sign in.");
      })
      .catch(err => { setError(true); setMessage(err.message); });
  }, []);

  return (
    <main className="min-h-screen bg-[#f5f2ed] px-6 py-16 font-mono text-[#1a1814]">
      <div className="mx-auto w-full max-w-sm">
        <button onClick={() => router.push("/")} className="mb-10 text-[10px] uppercase tracking-[0.3em] text-[#5a8a00]">← cv_tailor</button>
        <h1 className="text-3xl font-bold" style={{ fontFamily: "Georgia, serif" }}>Email verification</h1>
        <div className={`mt-6 rounded-sm border px-4 py-4 text-sm leading-relaxed ${error ? "border-[#ffcccc] bg-[#ffeaea] text-[#cc3333]" : "border-[#8ab030] bg-[#e8f5c0] text-[#3d6600]"}`}>
          {message}
        </div>
        <button onClick={() => router.push("/login")} className="mt-6 w-full rounded-sm bg-[#1a1814] py-3 text-sm font-bold uppercase tracking-[0.15em] text-[#f5f2ed]">Go to sign in</button>
      </div>
    </main>
  );
}
