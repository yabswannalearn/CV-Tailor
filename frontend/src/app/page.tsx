"use client";
import { useRouter } from "next/navigation";

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`;

export default function LandingPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#f5f2ed] text-[#1a1814] font-mono flex flex-col items-center justify-center px-6 relative overflow-hidden">

      {/* Grain overlay */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.07] z-0"
        style={{ backgroundImage: GRAIN, backgroundRepeat: "repeat", backgroundSize: "128px" }} />

      {/* Decorative top/bottom lines */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-b from-transparent to-[#c8f060]" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-t from-transparent to-[#c8f060]" />

      <div className="relative z-10 max-w-2xl w-full text-center">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 border border-[#5a8a0033] bg-[#c8f06022] rounded-full mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-[#5a8a00] animate-pulse" />
          <span className="text-[10px] tracking-[0.3em] text-[#5a8a00] uppercase">AI-Powered Resume Tailor</span>
        </div>

        {/* Headline */}
        <h1 className="text-6xl font-bold leading-none mb-6 text-[#1a1814]"
          style={{ fontFamily: "'Georgia', serif", letterSpacing: "-0.03em" }}>
          Your Resume,<br />
          <span className="text-[#5a8a00]" style={{ WebkitTextStroke: "1px #5a8a00" }}>Their Keywords.</span>
        </h1>

        <p className="text-[#7a7570] text-sm leading-relaxed mb-12 max-w-md mx-auto">
          Paste a job description. We read your profile, rewrite your CV
          to match, and compile a ready-to-send PDF — in seconds.
        </p>

        {/* CTAs */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => router.push("/register")}
            className="px-8 py-3 bg-[#1a1814] text-[#f5f2ed] text-sm font-bold tracking-[0.15em] uppercase rounded-sm hover:bg-[#2a2520] transition-colors duration-200"
          >
            Get Started
          </button>
          <button
            onClick={() => router.push("/login")}
            className="px-8 py-3 border border-[#d4cfc7] text-[#7a7570] text-sm font-bold tracking-[0.15em] uppercase rounded-sm hover:border-[#b0aba4] hover:text-[#1a1814] transition-colors duration-200"
          >
            Sign In
          </button>
        </div>

        {/* Stack tags */}
        <div className="mt-16 flex items-center justify-center gap-4 text-[#b0aba4] text-[10px] tracking-widest uppercase">
          <span>FastAPI</span><span>·</span>
          <span>Qwen2.5</span><span>·</span>
          <span>Go</span><span>·</span>
          <span>LaTeX</span><span>·</span>
          <span>PostgreSQL</span>
        </div>
      </div>
    </main>
  );
}