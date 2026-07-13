"use client";
import { useRouter } from "next/navigation";

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`;

export default function LandingPage() {
  const router = useRouter();

  return (
    <main className="relative min-h-screen overflow-y-auto bg-[#f5f2ed] px-5 py-12 text-[#1a1814] font-mono sm:flex sm:flex-col sm:items-center sm:justify-center sm:px-6 sm:py-0">

      {/* Grain overlay */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.07] z-0"
        style={{ backgroundImage: GRAIN, backgroundRepeat: "repeat", backgroundSize: "128px" }} />

      {/* Decorative top/bottom lines */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-b from-transparent to-[#c8f060]" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-t from-transparent to-[#c8f060]" />

      <div className="relative z-10 mx-auto w-full max-w-2xl text-center">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 border border-[#5a8a0033] bg-[#c8f06022] rounded-full mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-[#5a8a00] animate-pulse" />
          <span className="text-[10px] tracking-[0.3em] text-[#5a8a00] uppercase">AI-Powered Resume Tailor</span>
        </div>

        {/* Headline */}
        <h1 className="mb-6 text-4xl font-bold leading-none text-[#1a1814] sm:text-6xl"
          style={{ fontFamily: "'Georgia', serif", letterSpacing: "-0.03em" }}>
          Your Resume,<br />
          <span className="text-[#5a8a00]" style={{ WebkitTextStroke: "1px #5a8a00" }}>Their Keywords.</span>
        </h1>

        <p className="mx-auto mb-10 max-w-md text-sm leading-relaxed text-[#7a7570] sm:mb-12">
          Paste a job description. We read your profile, rewrite your CV
          to match, and compile a ready-to-send PDF — in seconds.
        </p>

        {/* CTAs */}
        <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
          <button
            onClick={() => router.push("/register")}
            className="w-full rounded-sm bg-[#1a1814] px-8 py-3 text-sm font-bold uppercase tracking-[0.15em] text-[#f5f2ed] transition-colors duration-200 hover:bg-[#2a2520] sm:w-auto"
          >
            Get Started
          </button>
          <button
            onClick={() => router.push("/login")}
            className="w-full rounded-sm border border-[#d4cfc7] px-8 py-3 text-sm font-bold uppercase tracking-[0.15em] text-[#7a7570] transition-colors duration-200 hover:border-[#b0aba4] hover:text-[#1a1814] sm:w-auto"
          >
            Sign In
          </button>
        </div>

        {/* Stack tags */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[10px] uppercase tracking-widest text-[#b0aba4] sm:mt-16">
          <span>FastAPI</span><span>·</span>
          <span>Gemini</span><span>·</span>
          <span>Go</span><span>·</span>
          <span>LaTeX</span><span>·</span>
          <span>PostgreSQL</span>
        </div>
      </div>
    </main>
  );
}
