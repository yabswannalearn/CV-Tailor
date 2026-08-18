"use client";
import Sidebar from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row h-screen min-w-0 overflow-hidden" style={{ background: "#f5f2ed" }}>
      <Sidebar />
      <main className="flex-1 min-h-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
