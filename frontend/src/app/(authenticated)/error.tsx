"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AuthenticatedError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    console.error("Authenticated route error", error);
  }, [error]);

  return (
    <div role="alert" className="flex min-h-full items-center justify-center bg-[#f5f2ed] p-6 font-mono">
      <div className="w-full max-w-md rounded-sm border border-[#e8aaaa] bg-[#fff0f0] p-6 text-[#7d2525]">
        <h2 className="font-bold">We couldn’t load this page.</h2>
        <p className="mt-2 text-sm">Try the request again. If your session expired, sign in and continue where you left off.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={unstable_retry} className="rounded-sm bg-[#1a1814] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[#f5f2ed]">Try again</button>
          <Link href="/login" className="rounded-sm border border-[#b83030] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em]">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
