"use client";
import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { API_URL } from "@/lib/api";

// Monaco editor — client only (no SSR)
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const API = API_URL;

// ── Types ────────────────────────────────────────────────────────
interface Problem {
  id: number;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  tags: string[];
  description?: string;
  examples?: { input: string; output: string }[];
  constraints?: string[];
  starter_code?: string;
}

interface RunResult {
  stdout: string;
  stderr: string;
  execution_time_ms: number;
  timed_out: boolean;
}

interface ReviewResult {
  time_complexity: string;
  space_complexity: string;
  correctness: string;
  strengths: string[];
  issues: string[];
  suggestions: string[];
  overall_score: number;
  verdict: string;
}

type RightPanel = "output" | "hint" | "review" | "error" | "generate";
type Difficulty = "All" | "Easy" | "Medium" | "Hard";

// ── Difficulty badge ─────────────────────────────────────────────
const DIFF_COLORS = {
  Easy:   { bg: "#e8f5c0", text: "#3d6600", border: "#8ab030" },
  Medium: { bg: "#fff8e0", text: "#7a5a00", border: "#f0d880" },
  Hard:   { bg: "#ffeaea", text: "#8a2a2a", border: "#f8b8b8" },
};

function DiffBadge({ diff }: { diff: "Easy" | "Medium" | "Hard" }) {
  const c = DIFF_COLORS[diff];
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold tracking-[0.08em] uppercase shrink-0"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {diff}
    </span>
  );
}

// ── Score ring ───────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const r = 22, circ = 2 * Math.PI * r;
  const fill = (score / 10) * circ;
  const color = score >= 8 ? "#5a8a00" : score >= 6 ? "#c8a800" : score >= 4 ? "#e07a00" : "#b83030";
  return (
    <div className="relative" style={{ width: 56, height: 56 }}>
      <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="28" cy="28" r={r} fill="none" stroke="#e8e4dd" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-bold" style={{ color, fontFamily: "'Georgia', serif", lineHeight: 1 }}>{score}</span>
        <span className="text-[8px]" style={{ color: "#a8a39c" }}>/10</span>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────
function CodePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobIdParam = searchParams.get("job_id");

  const [problems, setProblems] = useState<Problem[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<Problem | null>(null);
  const [code, setCode] = useState("");
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>("output");
  const [hintText, setHintText] = useState("");
  const [hintLevel, setHintLevel] = useState(1);
  const [hintLoading, setHintLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [errorExplanation, setErrorExplanation] = useState("");
  const [errorLoading, setErrorLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generatedProblems, setGeneratedProblems] = useState<Problem[]>([]);
  const [filterDiff, setFilterDiff] = useState<Difficulty>("All");
  const [filterTag, setFilterTag] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [jobs, setJobs] = useState<{ id: number; company_name: string; job_title: string; job_description?: string }[]>([]);
  const [selectedJobForGen, setSelectedJobForGen] = useState<string>("");
  const [genDifficulty, setGenDifficulty] = useState("Medium");
  const editorRef = useRef<any>(null);

  // ── Auth + load ──────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: "include" })
      .then(res => { if (!res.ok) router.push("/login"); });

    fetch(`${API}/code/problems`, { credentials: "include" })
      .then(res => res.ok ? res.json() : { problems: [] })
      .then(data => setProblems(data.problems));

    fetch(`${API}/tracker/`, { credentials: "include" })
      .then(res => res.ok ? res.json() : [])
      .then(data => { setJobs(data); if (jobIdParam) setSelectedJobForGen(jobIdParam); });
  }, []);

  // ── Load full problem ────────────────────────────────────────────
  const selectProblem = async (p: Problem) => {
    const res = await fetch(`${API}/code/problems/${p.id}`, { credentials: "include" });
    if (res.ok) {
      const full: Problem = await res.json();
      setSelectedProblem(full);
      setCode(full.starter_code || "# Write your solution here\n");
      setRunResult(null); setHintText(""); setReviewResult(null);
      setErrorExplanation(""); setRightPanel("output");
      setHintLevel(1);
    }
  };

  // ── Run code ─────────────────────────────────────────────────────
  const handleRun = async () => {
    if (!code.trim()) return;
    setRunning(true); setRightPanel("output");
    try {
      const res = await fetch(`${API}/code/run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ code }),
      });
      const data: RunResult = await res.json();
      setRunResult(data);
    } finally { setRunning(false); }
  };

  // ── Hint ─────────────────────────────────────────────────────────
  const handleHint = async () => {
    if (!selectedProblem) return;
    setHintLoading(true); setRightPanel("hint");
    try {
      const res = await fetch(`${API}/code/hint`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          problem_title: selectedProblem.title,
          problem_description: selectedProblem.description,
          current_code: code,
          hint_level: hintLevel,
        }),
      });
      const data = await res.json();
      setHintText(data.hint);
      if (hintLevel < 3) setHintLevel(l => l + 1);
    } finally { setHintLoading(false); }
  };

  // ── Review ───────────────────────────────────────────────────────
  const handleReview = async () => {
    if (!selectedProblem || !code.trim()) return;
    setReviewLoading(true); setRightPanel("review");
    try {
      const res = await fetch(`${API}/code/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          problem_title: selectedProblem.title,
          problem_description: selectedProblem.description,
          code,
          output: runResult?.stdout || "",
        }),
      });
      const data: ReviewResult = await res.json();
      setReviewResult(data);
    } finally { setReviewLoading(false); }
  };

  // ── Explain error ────────────────────────────────────────────────
  const handleExplainError = async () => {
    if (!runResult?.stderr) return;
    setErrorLoading(true); setRightPanel("error");
    try {
      const res = await fetch(`${API}/code/explain-error`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          code,
          error: runResult.stderr,
          problem_title: selectedProblem?.title || "",
        }),
      });
      const data = await res.json();
      setErrorExplanation(data.explanation);
    } finally { setErrorLoading(false); }
  };

  // ── Generate from JD ─────────────────────────────────────────────
  const handleGenerate = async () => {
    const job = jobs.find(j => String(j.id) === selectedJobForGen);
    if (!job) return;
    setGenerateLoading(true); setRightPanel("generate");
    try {
      const res = await fetch(`${API}/code/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          job_title: job.job_title,
          jd: job.job_description || "",
          difficulty: genDifficulty,
          count: 3,
        }),
      });
      const data = await res.json();
      setGeneratedProblems(data.problems);
      setProblems(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const newOnes = data.problems.filter((p: Problem) => !existingIds.has(p.id));
        return [...prev, ...newOnes];
      });
    } finally { setGenerateLoading(false); }
  };

  // ── Filtered problems ────────────────────────────────────────────
  const allTags = Array.from(new Set(problems.flatMap(p => p.tags)));
  const filtered = problems.filter(p => {
    const matchDiff = filterDiff === "All" || p.difficulty === filterDiff;
    const matchTag = filterTag === "All" || p.tags.includes(filterTag);
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || p.title.toLowerCase().includes(q);
    return matchDiff && matchTag && matchSearch;
  });

  // ── Keyboard shortcut ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); handleRun(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [code]);

  return (
    <div className="code-workspace h-full flex overflow-hidden font-mono" style={{ background: "#f5f2ed", color: "#1a1814" }}>

        {/* ── LEFT: Problem list ── */}
        <div className="code-sidebar flex flex-col shrink-0 overflow-hidden" style={{ width: 260, borderRight: "1px solid #d4cfc7", background: "#edeae4" }}>

          {/* Header */}
          <div className="px-4 py-4 shrink-0" style={{ borderBottom: "1px solid #d4cfc7" }}>
            <div className="text-[10px] tracking-[0.3em] uppercase mb-0.5" style={{ color: "#5a8a00" }}>cv_tailor</div>
            <h1 className="text-base font-bold" style={{ fontFamily: "'Georgia', serif" }}>Code Practice</h1>
            <p className="text-[10px] mt-0.5" style={{ color: "#a8a39c" }}>{problems.length} problems</p>
          </div>

          {/* Search */}
          <div className="px-3 py-2 shrink-0" style={{ borderBottom: "1px solid #d4cfc7" }}>
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2" width="10" height="10" viewBox="0 0 10 10" fill="none">
                <circle cx="4" cy="4" r="3" stroke="#a8a39c" strokeWidth="1.1"/>
                <line x1="6.5" y1="6.5" x2="9" y2="9" stroke="#a8a39c" strokeWidth="1.1" strokeLinecap="round"/>
              </svg>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search problems..."
                className="w-full pl-7 pr-2 py-1.5 text-[11px] rounded-sm outline-none"
                style={{ background: "#f5f2ed", color: "#1a1814", border: "1px solid #d4cfc7" }} />
            </div>
          </div>

          {/* Filters */}
          <div className="px-3 py-2 shrink-0 space-y-2" style={{ borderBottom: "1px solid #d4cfc7" }}>
            {/* Difficulty */}
            <div className="flex gap-1 flex-wrap">
              {(["All", "Easy", "Medium", "Hard"] as const).map(d => (
                <button key={d} onClick={() => setFilterDiff(d)}
                  className="text-[9px] px-2 py-0.5 rounded-sm transition-all font-bold tracking-[0.08em] uppercase"
                  style={{
                    background: filterDiff === d ? (d === "All" ? "#1a1814" : DIFF_COLORS[d as "Easy" | "Medium" | "Hard"]?.bg || "#e8e4dd") : "transparent",
                    color: filterDiff === d ? (d === "All" ? "#f5f2ed" : DIFF_COLORS[d as "Easy" | "Medium" | "Hard"]?.text || "#1a1814") : "#a8a39c",
                    border: `1px solid ${filterDiff === d ? (d === "All" ? "#1a1814" : DIFF_COLORS[d as "Easy" | "Medium" | "Hard"]?.border || "#d4cfc7") : "transparent"}`,
                  }}>
                  {d}
                </button>
              ))}
            </div>
            {/* Tags */}
            <select value={filterTag} onChange={e => setFilterTag(e.target.value)}
              className="w-full text-[10px] px-2 py-1 rounded-sm outline-none appearance-none"
              style={{ background: "#f5f2ed", color: "#7a7570", border: "1px solid #d4cfc7" }}>
              <option value="All">All topics</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Problem list */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-[10px]" style={{ color: "#a8a39c" }}>No problems found</div>
            ) : (
              filtered.map((p, i) => (
                <button key={p.id} onClick={() => selectProblem(p)}
                  className="w-full text-left px-4 py-3 transition-all"
                  style={{
                    background: selectedProblem?.id === p.id ? "#e8f5c0" : "transparent",
                    borderLeft: `2px solid ${selectedProblem?.id === p.id ? "#3d6600" : "transparent"}`,
                    borderBottom: "1px solid #d4cfc7",
                  }}
                  onMouseEnter={e => { if (selectedProblem?.id !== p.id) e.currentTarget.style.background = "#f0ede8"; }}
                  onMouseLeave={e => { if (selectedProblem?.id !== p.id) e.currentTarget.style.background = "transparent"; }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px]" style={{ color: "#a8a39c" }}>{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-[11px] flex-1 text-left leading-snug" style={{ color: selectedProblem?.id === p.id ? "#1a1814" : "#4a4540", fontWeight: selectedProblem?.id === p.id ? "700" : "400" }}>
                      {p.title}
                    </span>
                    <DiffBadge diff={p.difficulty} />
                  </div>
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {p.tags.slice(0, 2).map(t => (
                      <span key={t} className="text-[8px] px-1 py-0.5 rounded-sm"
                        style={{ background: "#f5f2ed", color: "#a8a39c", border: "1px solid #e8e4dd" }}>{t}</span>
                    ))}
                  </div>
                </button>
              ))
            )}

            {/* Generate from JD section */}
            <div className="p-3 m-3 rounded-sm" style={{ background: "#f5f2ed", border: "1px solid #d4cfc7" }}>
              <div className="text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: "#5a8a00" }}>Generate from JD</div>
              <select value={selectedJobForGen} onChange={e => setSelectedJobForGen(e.target.value)}
                className="w-full text-[10px] px-2 py-1.5 rounded-sm outline-none appearance-none mb-2"
                style={{ background: "#edeae4", color: "#4a4540", border: "1px solid #d4cfc7" }}>
                <option value="">Select a job...</option>
                {jobs.map(j => <option key={j.id} value={String(j.id)}>{j.company_name} — {j.job_title}</option>)}
              </select>
              <select value={genDifficulty} onChange={e => setGenDifficulty(e.target.value)}
                className="w-full text-[10px] px-2 py-1.5 rounded-sm outline-none appearance-none mb-2"
                style={{ background: "#edeae4", color: "#4a4540", border: "1px solid #d4cfc7" }}>
                <option>Easy</option><option>Medium</option><option>Hard</option>
              </select>
              <button onClick={handleGenerate} disabled={!selectedJobForGen || generateLoading}
                className="w-full py-1.5 text-[10px] font-bold tracking-[0.1em] uppercase rounded-sm transition-colors disabled:cursor-not-allowed"
                style={{ background: !selectedJobForGen || generateLoading ? "#d4cfc7" : "#1a1814", color: !selectedJobForGen || generateLoading ? "#a8a39c" : "#f5f2ed" }}>
                {generateLoading ? "Generating..." : "Generate 3 Problems →"}
              </button>
            </div>
          </div>
        </div>

        {/* ── MIDDLE: Problem description + editor ── */}
        <div className="flex flex-col flex-1 overflow-hidden" style={{ borderRight: "1px solid #d4cfc7" }}>

          {!selectedProblem ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect x="6" y="6" width="36" height="36" rx="3" stroke="#d4cfc7" strokeWidth="1.5"/>
                <path d="M16 19l5 5-5 5" stroke="#d4cfc7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="24" y1="29" x2="32" y2="29" stroke="#d4cfc7" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <p className="text-sm" style={{ color: "#a8a39c" }}>Select a problem to start coding</p>
            </div>
          ) : (
            <>
              {/* Problem description — scrollable top half */}
              <div className="overflow-y-auto shrink-0" style={{ maxHeight: "38%", borderBottom: "1px solid #d4cfc7" }}>
                <div className="px-5 py-4">
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="text-base font-bold" style={{ fontFamily: "'Georgia', serif", color: "#1a1814" }}>
                      {selectedProblem.title}
                    </h2>
                    <DiffBadge diff={selectedProblem.difficulty} />
                    <div className="flex gap-1 flex-wrap">
                      {selectedProblem.tags?.map(t => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-sm"
                          style={{ background: "#e8f0ff", color: "#2a4a8a", border: "1px solid #b8d0f8" }}>{t}</span>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs leading-relaxed mb-4" style={{ color: "#4a4540" }}>
                    {selectedProblem.description}
                  </p>

                  {selectedProblem.examples && selectedProblem.examples.length > 0 && (
                    <div className="mb-3">
                      <div className="text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: "#a8a39c" }}>Examples</div>
                      {selectedProblem.examples.map((ex, i) => (
                        <div key={i} className="mb-2 p-3 rounded-sm" style={{ background: "#f5f2ed", border: "1px solid #d4cfc7" }}>
                          <div className="text-[10px] mb-0.5" style={{ color: "#7a7570" }}>
                            <span className="font-bold" style={{ color: "#a8a39c" }}>Input:</span> {ex.input}
                          </div>
                          <div className="text-[10px]" style={{ color: "#7a7570" }}>
                            <span className="font-bold" style={{ color: "#a8a39c" }}>Output:</span> {ex.output}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedProblem.constraints && (
                    <div>
                      <div className="text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: "#a8a39c" }}>Constraints</div>
                      <ul className="space-y-0.5">
                        {selectedProblem.constraints.map((c, i) => (
                          <li key={i} className="text-[10px]" style={{ color: "#7a7570" }}>· {c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Editor toolbar */}
              <div className="flex items-center justify-between px-4 py-2 shrink-0"
                style={{ background: "#edeae4", borderBottom: "1px solid #d4cfc7" }}>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#f8b8b8" }} />
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#f0d880" }} />
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#c8e890" }} />
                  </div>
                  <span className="text-[10px]" style={{ color: "#a8a39c" }}>solution.py</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px]" style={{ color: "#a8a39c" }}>Ctrl+Enter to run</span>
                  <button onClick={() => setCode(selectedProblem.starter_code || "")}
                    className="text-[10px] px-2 py-1 rounded-sm transition-colors"
                    style={{ color: "#7a7570", border: "1px solid #d4cfc7" }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = "#b8b3aa"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "#d4cfc7"}>
                    Reset
                  </button>
                  <button onClick={handleRun} disabled={running}
                    className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold tracking-[0.1em] uppercase rounded-sm transition-colors disabled:cursor-not-allowed"
                    style={{ background: running ? "#d4cfc7" : "#3d6600", color: running ? "#a8a39c" : "#fff" }}>
                    {running ? (
                      <span className="flex items-center gap-1">
                        <span className="inline-flex gap-0.5">
                          {[0,80,160].map(d => <span key={d} className="w-1 h-1 rounded-full animate-bounce" style={{ background: "#a8a39c", animationDelay: `${d}ms` }} />)}
                        </span>
                        Running
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <svg width="8" height="9" viewBox="0 0 8 9" fill="none">
                          <path d="M1 1L7 4.5L1 8V1Z" fill="currentColor"/>
                        </svg>
                        Run
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Monaco editor */}
              <div className="flex-1 overflow-hidden">
                <MonacoEditor
                  height="100%"
                  language="python"
                  value={code}
                  onChange={v => setCode(v || "")}
                  onMount={editor => { editorRef.current = editor; }}
                  theme="vs-dark"
                  options={{
                    fontSize: 13,
                    fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Code', monospace",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    lineNumbers: "on",
                    renderLineHighlight: "all",
                    padding: { top: 12, bottom: 12 },
                    tabSize: 4,
                    automaticLayout: true,
                    wordWrap: "off",
                    suggest: { showKeywords: true },
                    quickSuggestions: true,
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: Output / AI panels ── */}
        <div className="code-output flex flex-col overflow-hidden" style={{ width: 340 }}>

          {/* Panel tabs */}
          <div className="flex shrink-0" style={{ borderBottom: "1px solid #d4cfc7", background: "#edeae4" }}>
            {([
              { key: "output", label: "Output" },
              { key: "hint", label: "Hint" },
              { key: "review", label: "Review" },
              { key: "error", label: "Error" },
              { key: "generate", label: "AI Gen" },
            ] as { key: RightPanel; label: string }[]).map(tab => (
              <button key={tab.key} onClick={() => setRightPanel(tab.key)}
                className="flex-1 py-2.5 text-[10px] font-bold tracking-[0.08em] uppercase transition-colors"
                style={{
                  color: rightPanel === tab.key ? "#1a1814" : "#a8a39c",
                  borderBottom: rightPanel === tab.key ? "2px solid #3d6600" : "2px solid transparent",
                  background: "transparent",
                }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto">

            {/* OUTPUT */}
            {rightPanel === "output" && (
              <div className="p-4">
                {!runResult && !running && (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <rect x="4" y="4" width="24" height="24" rx="3" stroke="#d4cfc7" strokeWidth="1.5"/>
                      <path d="M11 12l4 4-4 4" stroke="#d4cfc7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <line x1="17" y1="20" x2="22" y2="20" stroke="#d4cfc7" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <p className="text-[10px]" style={{ color: "#a8a39c" }}>Run your code to see output</p>
                  </div>
                )}
                {running && (
                  <div className="flex items-center justify-center py-12 gap-2">
                    {[0,100,200].map(d => <span key={d} className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#3d6600", animationDelay: `${d}ms` }} />)}
                  </div>
                )}
                {runResult && !running && (
                  <div className="space-y-3">
                    {/* Status bar */}
                    <div className="flex items-center justify-between px-3 py-2 rounded-sm"
                      style={{ background: runResult.stderr ? "#ffeaea" : runResult.timed_out ? "#fff8e0" : "#e8f5c0", border: `1px solid ${runResult.stderr ? "#f8b8b8" : runResult.timed_out ? "#f0d880" : "#8ab030"}` }}>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: runResult.stderr ? "#b83030" : runResult.timed_out ? "#c8a800" : "#5a8a00" }} />
                        <span className="text-[10px] font-bold uppercase tracking-wide"
                          style={{ color: runResult.stderr ? "#8a2a2a" : runResult.timed_out ? "#7a5a00" : "#3d6600" }}>
                          {runResult.timed_out ? "Timed Out" : runResult.stderr ? "Error" : "Success"}
                        </span>
                      </div>
                      <span className="text-[9px]" style={{ color: "#a8a39c" }}>{runResult.execution_time_ms}ms</span>
                    </div>

                    {/* Stdout */}
                    {runResult.stdout && (
                      <div>
                        <div className="text-[9px] tracking-[0.2em] uppercase mb-1.5" style={{ color: "#a8a39c" }}>Output</div>
                        <pre className="text-xs p-3 rounded-sm overflow-x-auto leading-relaxed"
                          style={{ background: "#1a1814", color: "#c8f060", fontFamily: "ui-monospace, monospace", whiteSpace: "pre-wrap" }}>
                          {runResult.stdout}
                        </pre>
                      </div>
                    )}

                    {/* Stderr */}
                    {runResult.stderr && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="text-[9px] tracking-[0.2em] uppercase" style={{ color: "#b83030" }}>Error</div>
                          <button onClick={handleExplainError}
                            className="text-[9px] px-2 py-0.5 rounded-sm transition-colors"
                            style={{ background: "#ffeaea", color: "#b83030", border: "1px solid #f8b8b8" }}>
                            Explain this error →
                          </button>
                        </div>
                        <pre className="text-xs p-3 rounded-sm overflow-x-auto leading-relaxed"
                          style={{ background: "#1a1814", color: "#ff8080", fontFamily: "ui-monospace, monospace", whiteSpace: "pre-wrap" }}>
                          {runResult.stderr}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* HINT */}
            {rightPanel === "hint" && (
              <div className="p-4">
                <div className="mb-4">
                  <div className="text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: "#a8a39c" }}>Hint Level</div>
                  <div className="flex gap-2">
                    {[1, 2, 3].map(l => (
                      <button key={l} onClick={() => setHintLevel(l)}
                        className="flex-1 py-1.5 text-[10px] font-bold rounded-sm transition-all"
                        style={{
                          background: hintLevel >= l ? "#e8f5c0" : "#f0ede8",
                          color: hintLevel >= l ? "#3d6600" : "#a8a39c",
                          border: `1px solid ${hintLevel >= l ? "#8ab030" : "#d4cfc7"}`,
                        }}>
                        {l === 1 ? "Subtle" : l === 2 ? "Moderate" : "Direct"}
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={handleHint} disabled={hintLoading || !selectedProblem}
                  className="w-full py-2.5 text-[11px] font-bold tracking-[0.1em] uppercase rounded-sm transition-colors mb-4 disabled:cursor-not-allowed"
                  style={{ background: hintLoading || !selectedProblem ? "#d4cfc7" : "#1a1814", color: hintLoading || !selectedProblem ? "#a8a39c" : "#f5f2ed" }}>
                  {hintLoading ? "Getting hint..." : hintText ? "Get another hint →" : "Get hint →"}
                </button>

                {hintText && (
                  <div className="p-4 rounded-sm" style={{ background: "#e8f0ff", border: "1px solid #b8d0f8" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <circle cx="6" cy="6" r="5" stroke="#4a7acc" strokeWidth="1.1"/>
                        <line x1="6" y1="5" x2="6" y2="8" stroke="#4a7acc" strokeWidth="1.1" strokeLinecap="round"/>
                        <circle cx="6" cy="3.5" r="0.6" fill="#4a7acc"/>
                      </svg>
                      <span className="text-[9px] tracking-[0.2em] uppercase" style={{ color: "#4a7acc" }}>Level {hintLevel - 1} Hint</span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: "#2a4a8a" }}>{hintText}</p>
                  </div>
                )}
              </div>
            )}

            {/* REVIEW */}
            {rightPanel === "review" && (
              <div className="p-4">
                <button onClick={handleReview} disabled={reviewLoading || !selectedProblem || !code.trim()}
                  className="w-full py-2.5 text-[11px] font-bold tracking-[0.1em] uppercase rounded-sm transition-colors mb-4 disabled:cursor-not-allowed"
                  style={{ background: reviewLoading || !code.trim() ? "#d4cfc7" : "#1a1814", color: reviewLoading || !code.trim() ? "#a8a39c" : "#f5f2ed" }}>
                  {reviewLoading ? "Reviewing code..." : "Review my solution →"}
                </button>

                {reviewResult && (
                  <div className="space-y-3">
                    {/* Score + verdict */}
                    <div className="flex items-center gap-4 p-4 rounded-sm" style={{ background: "#edeae4", border: "1px solid #d4cfc7" }}>
                      <ScoreRing score={reviewResult.overall_score} />
                      <div className="flex-1">
                        <p className="text-xs font-bold leading-snug" style={{ color: "#1a1814", fontFamily: "'Georgia', serif" }}>
                          {reviewResult.verdict}
                        </p>
                        <span className="text-[10px] mt-1 px-1.5 py-0.5 rounded-sm inline-block"
                          style={{
                            background: reviewResult.correctness === "correct" ? "#e8f5c0" : reviewResult.correctness === "partially correct" ? "#fff8e0" : "#ffeaea",
                            color: reviewResult.correctness === "correct" ? "#3d6600" : reviewResult.correctness === "partially correct" ? "#7a5a00" : "#8a2a2a",
                          }}>
                          {reviewResult.correctness}
                        </span>
                      </div>
                    </div>

                    {/* Complexity */}
                    <div className="grid grid-cols-2 gap-2">
                      {[["Time", reviewResult.time_complexity], ["Space", reviewResult.space_complexity]].map(([k, v]) => (
                        <div key={k} className="p-3 rounded-sm" style={{ background: "#f5f2ed", border: "1px solid #d4cfc7" }}>
                          <div className="text-[9px] uppercase tracking-wide mb-1" style={{ color: "#a8a39c" }}>{k}</div>
                          <div className="text-[11px] font-bold" style={{ color: "#1a1814", fontFamily: "ui-monospace, monospace" }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Strengths */}
                    {reviewResult.strengths.length > 0 && (
                      <div className="p-3 rounded-sm" style={{ background: "#f0fde8", border: "1px solid #c8e890" }}>
                        <div className="text-[9px] uppercase tracking-wide mb-2" style={{ color: "#3d6600" }}>✓ Strengths</div>
                        <ul className="space-y-1">
                          {reviewResult.strengths.map((s, i) => <li key={i} className="text-[11px]" style={{ color: "#2a4a1a" }}>· {s}</li>)}
                        </ul>
                      </div>
                    )}

                    {/* Issues */}
                    {reviewResult.issues.length > 0 && (
                      <div className="p-3 rounded-sm" style={{ background: "#ffeaea", border: "1px solid #f8b8b8" }}>
                        <div className="text-[9px] uppercase tracking-wide mb-2" style={{ color: "#b83030" }}>✗ Issues</div>
                        <ul className="space-y-1">
                          {reviewResult.issues.map((s, i) => <li key={i} className="text-[11px]" style={{ color: "#5a1a1a" }}>· {s}</li>)}
                        </ul>
                      </div>
                    )}

                    {/* Suggestions */}
                    {reviewResult.suggestions.length > 0 && (
                      <div className="p-3 rounded-sm" style={{ background: "#fff8e0", border: "1px solid #f0d880" }}>
                        <div className="text-[9px] uppercase tracking-wide mb-2" style={{ color: "#7a5a00" }}>→ Suggestions</div>
                        <ul className="space-y-1">
                          {reviewResult.suggestions.map((s, i) => <li key={i} className="text-[11px]" style={{ color: "#5a4000" }}>· {s}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ERROR EXPLANATION */}
            {rightPanel === "error" && (
              <div className="p-4">
                {!runResult?.stderr && (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <p className="text-[10px] text-center" style={{ color: "#a8a39c" }}>Run your code first — error explanations appear here when there's a traceback</p>
                  </div>
                )}
                {runResult?.stderr && (
                  <>
                    <button onClick={handleExplainError} disabled={errorLoading}
                      className="w-full py-2.5 text-[11px] font-bold tracking-[0.1em] uppercase rounded-sm transition-colors mb-4 disabled:cursor-not-allowed"
                      style={{ background: errorLoading ? "#d4cfc7" : "#b83030", color: errorLoading ? "#a8a39c" : "#fff" }}>
                      {errorLoading ? "Analyzing error..." : "Explain this error →"}
                    </button>

                    <div className="p-3 rounded-sm mb-3" style={{ background: "#1a1814", border: "1px solid #2a2520" }}>
                      <pre className="text-[10px] leading-relaxed" style={{ color: "#ff8080", fontFamily: "ui-monospace, monospace", whiteSpace: "pre-wrap" }}>
                        {runResult.stderr}
                      </pre>
                    </div>

                    {errorExplanation && (
                      <div className="p-4 rounded-sm" style={{ background: "#fff8e0", border: "1px solid #f0d880" }}>
                        <div className="text-[9px] uppercase tracking-wide mb-2" style={{ color: "#7a5a00" }}>Explanation</div>
                        <p className="text-xs leading-relaxed" style={{ color: "#5a4000" }}>{errorExplanation}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* AI GENERATE */}
            {rightPanel === "generate" && (
              <div className="p-4">
                <div className="text-[9px] tracking-[0.2em] uppercase mb-3" style={{ color: "#a8a39c" }}>Generate problems from Job Description</div>

                <div className="space-y-2 mb-4">
                  <select value={selectedJobForGen} onChange={e => setSelectedJobForGen(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-sm outline-none appearance-none"
                    style={{ background: "#edeae4", color: "#4a4540", border: "1px solid #d4cfc7" }}>
                    <option value="">Select a job...</option>
                    {jobs.map(j => <option key={j.id} value={String(j.id)}>{j.company_name} — {j.job_title}</option>)}
                  </select>
                  <select value={genDifficulty} onChange={e => setGenDifficulty(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-sm outline-none appearance-none"
                    style={{ background: "#edeae4", color: "#4a4540", border: "1px solid #d4cfc7" }}>
                    <option>Easy</option><option>Medium</option><option>Hard</option>
                  </select>
                  <button onClick={handleGenerate} disabled={!selectedJobForGen || generateLoading}
                    className="w-full py-2.5 text-[11px] font-bold tracking-[0.1em] uppercase rounded-sm transition-colors disabled:cursor-not-allowed"
                    style={{ background: !selectedJobForGen || generateLoading ? "#d4cfc7" : "#1a1814", color: !selectedJobForGen || generateLoading ? "#a8a39c" : "#f5f2ed" }}>
                    {generateLoading ? "Generating..." : "Generate 3 Problems →"}
                  </button>
                </div>

                {generatedProblems.length > 0 && (
                  <div>
                    <div className="text-[9px] uppercase tracking-wide mb-2" style={{ color: "#5a8a00" }}>Generated — click to load</div>
                    <div className="space-y-2">
                      {generatedProblems.map(p => (
                        <button key={p.id} onClick={() => selectProblem(p)}
                          className="w-full text-left p-3 rounded-sm transition-all"
                          style={{ background: "#edeae4", border: "1px solid #d4cfc7" }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = "#8ab030"; e.currentTarget.style.background = "#e8f5c0"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = "#d4cfc7"; e.currentTarget.style.background = "#edeae4"; }}>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[11px] font-bold" style={{ color: "#1a1814" }}>{p.title}</span>
                            <DiffBadge diff={p.difficulty} />
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {p.tags?.map(t => (
                              <span key={t} className="text-[8px] px-1 py-0.5 rounded-sm"
                                style={{ background: "#f5f2ed", color: "#a8a39c" }}>{t}</span>
                            ))}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
    </div>
  );
}

export default function CodePage() {
  return (
    <Suspense fallback={null}>
      <CodePageContent />
    </Suspense>
  );
}
