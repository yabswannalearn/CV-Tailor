"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { queryClient } from "@/lib/queryClient";
import { store } from "@/lib/store";
import { Toaster } from "sonner";
import { ApiQueryError, queryKeys } from "@/lib/queries";

export default function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => queryClient.getQueryCache().subscribe(event => {
    if (event.type !== "updated" || event.action.type !== "error") return;
    if (!(event.query.state.error instanceof ApiQueryError) || event.query.state.error.status !== 401) return;
    queryClient.removeQueries({ queryKey: queryKeys.authenticated });
    router.replace("/login");
  }), [router]);

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster richColors position="top-right" closeButton />
      </QueryClientProvider>
    </Provider>
  );
}

