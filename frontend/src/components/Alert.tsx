import type { ReactNode } from "react";

export default function Alert({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={`alert-in rounded-sm border border-[#e8aaaa] bg-[#fff0f0] px-5 py-4 font-mono text-sm text-[#7d2525] ${className}`}
    >
      {children}
    </div>
  );
}
