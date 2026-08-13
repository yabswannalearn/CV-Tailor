"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { API_URL } from "@/lib/api";

function VerifyContent() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [message, setMessage] = useState(token ? "Verifying your email..." : "This verification link is missing a token.");
  const [error, setError] = useState(!token);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Verification failed.");
        setMessage(data.message || "Email verified. You can now sign in.");
      })
      .catch((reason: unknown) => {
        setError(true);
        setMessage(reason instanceof Error ? reason.message : "Verification failed.");
      });
  }, [token]);

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

export default function VerifyPage() {
  return <Suspense fallback={null}><VerifyContent /></Suspense>;
}
