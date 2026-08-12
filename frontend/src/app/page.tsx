"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  FileText, KanbanSquare, Search, MessageSquare, Code2, UploadCloud,
  ArrowRight, Send, Sparkles,
} from "lucide-react";

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`;

const C = {
  bg: "#f5f2ed",
  bgCard: "#edeae4",
  card: "#fffdf9",
  ink: "#1a1814",
  sub: "#7a7570",
  muted: "#a8a39c",
  faint: "#b0aba4",
  border: "#d4cfc7",
  green: "#5a8a00",
  greenDark: "#3d6600",
  greenBg: "#e8f5c0",
  lime: "#c8f060",
};

const FEATURES = [
  {
    icon: FileText,
    title: "AI-Tailored Resumes",
    body: "Paste any job description and Gemini rewrites your CV to match its language and requirements — while staying true to your real experience.",
  },
  {
    icon: Send,
    title: "Multi-Format Export",
    body: "Fine-tune your resume in a live in-browser editor, then export straight to PDF, Word, or LaTeX.",
  },
  {
    icon: KanbanSquare,
    title: "Job Tracker",
    body: "Track every application from applied to offer, all in one board built for the job hunt.",
  },
  {
    icon: Search,
    title: "AI Job Discovery",
    body: "We scrape public listings from job boards and score each one against your profile, so you only apply to strong-fit roles.",
  },
  {
    icon: MessageSquare,
    title: "AI Interview Practice",
    body: "Rehearse real interview questions for the exact role you're applying to, with instant AI feedback on your answers.",
  },
  {
    icon: Code2,
    title: "Code Practice",
    body: "Sharpen your technical interview skills with a built-in problem set and editor — no context-switching required.",
  },
];

const STEPS = [
  {
    icon: UploadCloud,
    title: "Build your profile",
    body: "Upload an existing resume or fill in your experience once. We parse and store it for every application after.",
  },
  {
    icon: Sparkles,
    title: "Paste the job description",
    body: "Drop in any listing and let Gemini tailor your resume to match its keywords and requirements.",
  },
  {
    icon: Send,
    title: "Export & track",
    body: "Download a polished PDF, Word doc, or LaTeX file, then track the application through to the offer.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
};

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={fadeUp}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="relative min-h-screen overflow-x-hidden font-mono text-[#1a1814]" style={{ background: C.bg }}>

      {/* Grain overlay */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.07] z-0"
        style={{ backgroundImage: GRAIN, backgroundRepeat: "repeat", backgroundSize: "128px" }} />

      {/* ── Nav ── */}
      <header
        className="fixed top-0 left-0 right-0 z-40 transition-all duration-300"
        style={{
          background: scrolled ? "rgba(245,242,237,0.85)" : "transparent",
          backdropFilter: scrolled ? "blur(10px)" : "none",
          borderBottom: scrolled ? `1px solid ${C.border}` : "1px solid transparent",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-sm flex items-center justify-center" style={{ background: C.greenDark }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 2H6.5L8 3.5V8H2V2Z" fill="white" />
                <path d="M4 5H7" stroke={C.greenDark} strokeWidth="1" />
                <path d="M4 6.5H6" stroke={C.greenDark} strokeWidth="1" />
              </svg>
            </div>
            <span className="text-[12px] font-bold tracking-[0.15em] uppercase">cv_tailor</span>
          </div>

          <nav className="hidden items-center gap-8 text-[11px] uppercase tracking-[0.15em] sm:flex" style={{ color: C.sub }}>
            <a href="#features" onClick={scrollTo("features")} className="transition-colors hover:text-[#1a1814]">Features</a>
            <a href="#how-it-works" onClick={scrollTo("how-it-works")} className="transition-colors hover:text-[#1a1814]">How it works</a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => router.push("/login")}
              className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.15em] transition-colors hover:text-[#1a1814] sm:px-4"
              style={{ color: C.sub }}
            >
              Sign In
            </button>
            <button
              onClick={() => router.push("/register")}
              className="rounded-sm px-3 py-2 text-[11px] font-bold uppercase tracking-[0.15em] text-[#f5f2ed] transition-colors duration-200 sm:px-4"
              style={{ background: C.ink }}
              onMouseEnter={e => (e.currentTarget.style.background = "#2a2520")}
              onMouseLeave={e => (e.currentTarget.style.background = C.ink)}
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-5 pt-32 pb-20 sm:px-8 sm:pt-40 sm:pb-28 lg:flex-row lg:items-center lg:gap-12 lg:pt-48">

        {/* Ambient blobs */}
        <div className="pointer-events-none absolute -top-20 right-0 h-72 w-72 rounded-full blur-3xl" style={{ background: C.lime, opacity: 0.18 }} />
        <div className="pointer-events-none absolute top-40 left-0 h-64 w-64 rounded-full blur-3xl" style={{ background: C.green, opacity: 0.08 }} />

        <div className="relative z-10 w-full max-w-xl text-center lg:text-left">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 inline-flex items-center gap-2 rounded-full border px-3 py-1"
            style={{ borderColor: "#5a8a0033", background: "#c8f06022" }}
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: C.green }} />
            <span className="text-[10px] uppercase tracking-[0.3em]" style={{ color: C.green }}>AI-Powered Career Toolkit</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-6 text-4xl font-bold leading-none sm:text-6xl"
            style={{ fontFamily: "'Georgia', serif", letterSpacing: "-0.03em" }}
          >
            Your Resume,<br />
            <span style={{ color: C.green, WebkitTextStroke: `1px ${C.green}` }}>Their Keywords.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mb-10 max-w-md text-sm leading-relaxed sm:mb-8 lg:mx-0"
            style={{ color: C.sub }}
          >
            Paste a job description. We read your profile, rewrite your CV
            to match, and compile a ready-to-send PDF — in seconds.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4 lg:justify-start"
          >
            <button
              onClick={() => router.push("/register")}
              className="group flex w-full items-center justify-center gap-2 rounded-sm px-8 py-3 text-sm font-bold uppercase tracking-[0.15em] text-[#f5f2ed] transition-colors duration-200 sm:w-auto"
              style={{ background: C.ink }}
              onMouseEnter={e => (e.currentTarget.style.background = "#2a2520")}
              onMouseLeave={e => (e.currentTarget.style.background = C.ink)}
            >
              Get Started
              <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-1" />
            </button>
            <button
              onClick={() => router.push("/login")}
              className="w-full rounded-sm border px-8 py-3 text-sm font-bold uppercase tracking-[0.15em] transition-colors duration-200 sm:w-auto"
              style={{ borderColor: C.border, color: C.sub }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.faint; e.currentTarget.style.color = C.ink; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.sub; }}
            >
              Sign In
            </button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-5 text-[11px] tracking-wide"
            style={{ color: C.faint }}
          >
            No credit card required
          </motion.p>
        </div>

        {/* Hero mockup card */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 mt-16 w-full max-w-md lg:mt-0"
        >
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="rounded-xl border p-5 shadow-xl"
            style={{ borderColor: C.border, background: C.card }}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: C.muted }}>tailored_resume.pdf</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
                style={{ color: C.greenDark, background: C.greenBg, borderColor: "#8ab030" }}>
                <span className="h-2 w-2 rounded-full" style={{ background: C.greenDark }} />
                94% Match
              </span>
            </div>
            <div className="space-y-2.5">
              <div className="h-3 w-2/3 rounded" style={{ background: C.border }} />
              <div className="h-2.5 w-full rounded" style={{ background: "#e8e4dd" }} />
              <div className="h-2.5 w-5/6 rounded" style={{ background: "#e8e4dd" }} />
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {["React", "TypeScript", "REST APIs", "PostgreSQL"].map(tag => (
                  <span key={tag} className="rounded-sm px-2 py-1 text-[10px] font-medium" style={{ background: C.greenBg, color: C.greenDark }}>
                    {tag}
                  </span>
                ))}
              </div>
              <div className="h-2.5 w-full rounded" style={{ background: "#e8e4dd" }} />
              <div className="h-2.5 w-4/6 rounded" style={{ background: "#e8e4dd" }} />
            </div>
            <div className="mt-5 flex items-center gap-2 border-t pt-4" style={{ borderColor: C.border }}>
              <Sparkles size={13} style={{ color: C.green }} />
              <span className="text-[11px]" style={{ color: C.sub }}>Rewritten to match the job description</span>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Stack strip ── */}
      <Reveal className="relative z-10 mx-auto max-w-6xl px-5 pb-16 sm:px-8">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[10px] uppercase tracking-widest" style={{ color: C.faint }}>
          <span>FastAPI</span><span>·</span>
          <span>Gemini</span><span>·</span>
          <span>Go</span><span>·</span>
          <span>LaTeX</span><span>·</span>
          <span>PostgreSQL</span>
        </div>
      </Reveal>

      {/* ── Features ── */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <Reveal className="mx-auto mb-14 max-w-lg text-center">
          <span className="text-[10px] uppercase tracking-[0.3em]" style={{ color: C.green }}>Everything you need</span>
          <h2 className="mt-3 text-3xl font-bold sm:text-4xl" style={{ fontFamily: "'Georgia', serif", letterSpacing: "-0.02em" }}>
            One toolkit for the whole job hunt.
          </h2>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: C.sub }}>
            From tailoring your resume to acing the interview — every step, in one place.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <Reveal key={f.title} delay={(i % 3) * 0.08}>
                <div
                  className="group h-full rounded-xl border p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                  style={{ borderColor: C.border, background: C.card }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "#8ab030")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-sm transition-colors duration-300" style={{ background: C.greenBg }}>
                    <Icon size={18} style={{ color: C.greenDark }} />
                  </div>
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.08em]">{f.title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: C.sub }}>{f.body}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="relative z-10 mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <Reveal className="mx-auto mb-14 max-w-lg text-center">
          <span className="text-[10px] uppercase tracking-[0.3em]" style={{ color: C.green }}>How it works</span>
          <h2 className="mt-3 text-3xl font-bold sm:text-4xl" style={{ fontFamily: "'Georgia', serif", letterSpacing: "-0.02em" }}>
            Three steps to your next offer.
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <Reveal key={s.title} delay={i * 0.12} className="relative">
                <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold" style={{ borderColor: C.border, background: C.bgCard }}>
                      {i + 1}
                    </div>
                    <Icon size={18} style={{ color: C.green }} />
                  </div>
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.08em]">{s.title}</h3>
                  <p className="max-w-xs text-xs leading-relaxed" style={{ color: C.sub }}>{s.body}</p>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="absolute right-[-12%] top-5 hidden h-px w-1/4 sm:block" style={{ background: C.border }} />
                )}
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <Reveal>
          <div
            className="relative overflow-hidden rounded-2xl border px-8 py-14 text-center sm:px-16 sm:py-20"
            style={{ borderColor: C.border, background: C.ink }}
          >
            <div className="pointer-events-none absolute -top-24 right-0 h-64 w-64 rounded-full blur-3xl" style={{ background: C.lime, opacity: 0.12 }} />
            <h2 className="relative z-10 text-3xl font-bold text-[#f5f2ed] sm:text-4xl" style={{ fontFamily: "'Georgia', serif", letterSpacing: "-0.02em" }}>
              Stop rewriting your resume<br className="hidden sm:block" /> for every application.
            </h2>
            <p className="relative z-10 mx-auto mt-4 max-w-md text-sm leading-relaxed" style={{ color: "#b0aba4" }}>
              Let Gemini handle the tailoring — you focus on landing the role.
            </p>
            <div className="relative z-10 mt-8 flex justify-center">
              <button
                onClick={() => router.push("/register")}
                className="group flex items-center gap-2 rounded-sm px-8 py-3 text-sm font-bold uppercase tracking-[0.15em] transition-colors duration-200"
                style={{ background: C.lime, color: C.ink }}
                onMouseEnter={e => (e.currentTarget.style.background = "#d4f570")}
                onMouseLeave={e => (e.currentTarget.style.background = C.lime)}
              >
                Get Started Free
                <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t px-5 py-10 sm:px-8" style={{ borderColor: C.border }}>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm flex items-center justify-center" style={{ background: C.greenDark }}>
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                <path d="M2 2H6.5L8 3.5V8H2V2Z" fill="white" />
              </svg>
            </div>
            <span className="text-[11px] font-bold tracking-[0.15em] uppercase" style={{ color: C.sub }}>cv_tailor</span>
          </div>
          <p className="text-[11px]" style={{ color: C.faint }}>© 2026 cv_tailor. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
