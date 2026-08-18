"use client";

import { useEffect } from "react";
import Alert from "@/components/Alert";
import Button, { ButtonLink } from "@/components/Button";

export default function AuthenticatedError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    console.error("Authenticated route error", error);
  }, [error]);

  return (
    <div className="flex min-h-full items-center justify-center bg-[#f5f2ed] p-6 font-mono">
      <Alert className="w-full max-w-md">
        <h2 className="font-bold">We couldn’t load this page.</h2>
        <p className="mt-2 text-sm">Try the request again. If your session expired, sign in and continue where you left off.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="primary" size="md" onClick={unstable_retry}>Try again</Button>
          <ButtonLink variant="outline" size="md" href="/login">Sign in</ButtonLink>
        </div>
      </Alert>
    </div>
  );
}
