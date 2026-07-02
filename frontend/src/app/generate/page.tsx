"use client";
import { Suspense, useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import AppLayout from "@/components/AppLayout";
import { API_URL } from "@/lib/api";

const Document = dynamic(() => import("react-pdf").then(m => m.Document), { ssr: false });
const Page = dynamic(() => import("react-pdf").then(m => m.Page), { ssr: false });

if (typeof window !== "undefined") {
  import("react-pdf").then(({ pdfjs }) => {
    pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  });
}

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`;

const C = {
  bg:           "#f5f2ed",
  bgCard:       "#edeae4",
  bgEditor:     "#f9f7f4",
  bgSnippet:    "#ece9e3",
  border:       "#d4cfc7",
  borderStrong: "#b8b3aa",
  text:         "#1a1814",
  textMid:      "#4a4540",
  textMuted:    "#7a7570",
  textFaint:    "#a8a39c",
  green:        "#3d6600",
  greenLight:   "#e8f5c0",
  greenBorder:  "#8ab030",
  red:          "#b83030",
  redBg:        "#ffeaea",
  editorFg:     "#2a2420",
  lineNum:      "#c0bbb4",
  lineNumActive:"#5a8a00",
};

type AppState = "idle" | "generating" | "editing" | "compiling" | "error";

function parseSections(code: string) {
  return code.split("\n").reduce<{ name: string; line: number }[]>((acc, l, i) => {
    const m = l.match(/\\section\{([^}]+)\}/);
    if (m) acc.push({ name: m[1], line: i + 1 });
    return acc;
  }, []);
}

function scrollToLine(ta: HTMLTextAreaElement, lineNum: number) {
  const lines = ta.value.split("\n");
  let charPos = 0;
  for (let i = 0; i < Math.min(lineNum - 1, lines.length); i++) charPos += lines[i].length + 1;
  ta.focus();
  ta.selectionStart = charPos;
  ta.selectionEnd = charPos + (lines[lineNum - 1]?.length || 0);
  ta.scrollTop = Math.max(0, (lineNum - 5) * 19.2);
}

const Icon = ({ children, title, onClick, active }: { children: React.ReactNode; title: string; onClick?: () => void; active?: boolean }) => (
  <button title={title} onClick={onClick}
    className="flex items-center justify-center w-7 h-7 rounded transition-all duration-100 shrink-0"
    style={{ color: active ? C.green : C.textMid, background: active ? C.greenLight : "transparent", border: `1px solid ${active ? C.greenBorder : "transparent"}` }}
    onMouseEnter={e => { if (!active) { e.currentTarget.style.background = C.bgSnippet; e.currentTarget.style.borderColor = C.border; }}}
    onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}}>
    {children}
  </button>
);

const Divider = () => <div className="w-px h-4 mx-1 shrink-0" style={{ background: C.border }} />;

function GeneratePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job_id");

  const [jd, setJd] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("classic");
  const [latex, setLatex] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [appState, setAppState] = useState<AppState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [credits, setCredits] = useState(0);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [zoom, setZoom] = useState(100);
  const [findText, setFindText] = useState("");
  const [showFind, setShowFind] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sections, setSections] = useState<{ name: string; line: number }[]>([]);
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const [clickedWord, setClickedWord] = useState<string | null>(null);
  const [splitPct, setSplitPct] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(true);
  const [jobLabel, setJobLabel] = useState<string | null>(null);
  const [savingToJob, setSavingToJob] = useState(false);
  const [savedToJob, setSavedToJob] = useState(false);
  const [presetSlug, setPresetSlug] = useState("blank");
  const [presets, setPresets] = useState<{slug: string, display_name: string, recommended_template: string}[]>([]);
  const [atsResult, setAtsResult] = useState<{pass: boolean, warnings: string[]} | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);

  // ── compile helper (defined before useEffect so it can be called from it) ──
  const compileLatex = useCallback(async (src?: string) => {
    const source = src ?? latex;
    if (!source.trim()) return;
    if (pdfUrl) { window.URL.revokeObjectURL(pdfUrl); setPdfUrl(null); }
    setAppState("compiling"); setErrorMsg("");
    try {
      const res = await fetch(`${API_URL}/generate/compile-with-check`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex: source }),
      });
      if (!res.ok) {
        let message = "Compile failed";
        try {
          const e = await res.json();
          message = e.detail || e.details || e.error || message;
        } catch {}
        throw new Error(message);
      }
      const { pdf_b64, ats } = await res.json();
      const byteCharacters = atob(pdf_b64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) { byteNumbers[i] = byteCharacters.charCodeAt(i); }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      setPdfUrl(window.URL.createObjectURL(blob));
      setAtsResult(ats);
      setAppState("editing"); setNumPages(0); setCurrentPage(1);
    } catch (err: any) { setErrorMsg(err.message); setAppState("error"); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latex]);

  useEffect(() => {
    fetch(`${API_URL}/presets`)
      .then(res => res.json())
      .then(data => setPresets(data))
      .catch(console.error);

    // Auth check
    fetch(`${API_URL}/auth/me`, { credentials: "include" })
      .then(res => { if (!res.ok) { router.push("/login"); return null; } return res.json(); })
      .then(data => { 
        if (data) { 
          setUserEmail(data.email); 
          setCredits(data.credits); 
          fetch(`${API_URL}/profile/load/${data.email}`, { credentials: "include" })
            .then(res => res.ok ? res.json() : null)
            .then(p => {
              if (p && p.preset_slug) {
                 setPresetSlug(p.preset_slug);
              }
            });
        } 
      })
      .catch(() => router.push("/login"));

    // If coming from tracker, load existing LaTeX
    if (jobId) {
      fetch(`${API_URL}/tracker/${jobId}/latex`, { credentials: "include" })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.latex) {
            setLatex(data.latex);
            setHasGenerated(true);
            // Compile after state is set via a small delay
            setTimeout(() => {
              compileLatex(data.latex);
            }, 100);
          }
        });

      // Also fetch job info for label
      fetch(`${API_URL}/tracker/`, { credentials: "include" })
        .then(res => res.ok ? res.json() : null)
        .then(jobs => {
          if (jobs) {
            const job = jobs.find((j: any) => j.id === parseInt(jobId));
            if (job) setJobLabel(`${job.company_name} — ${job.job_title}`);
          }
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => { setSections(parseSections(latex)); }, [latex]);

  useEffect(() => {
    if (highlightedLine !== null) {
      const t = setTimeout(() => setHighlightedLine(null), 2000);
      return () => clearTimeout(t);
    }
  }, [highlightedLine]);

  const onDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = true;
    setIsDragging(true);
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(75, Math.max(25, pct)));
    };
    const onUp = () => {
      dragRef.current = false;
      setIsDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const updateCursorPos = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const text = ta.value.substring(0, ta.selectionStart);
    const lines = text.split("\n");
    setCursorPos({ line: lines.length, col: lines[lines.length - 1].length + 1 });
  };

  const insertAround = (before: string, after: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const selected = latex.substring(start, end);
    const newVal = latex.substring(0, start) + before + selected + after + latex.substring(end);
    setLatex(newVal);
    setTimeout(() => { ta.focus(); ta.selectionStart = start + before.length; ta.selectionEnd = end + before.length; }, 0);
  };

  const insertAt = (text: string, offset: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const newVal = latex.substring(0, start) + text + latex.substring(ta.selectionEnd);
    setLatex(newVal);
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + offset; }, 0);
  };

  const handleFind = () => {
    if (!findText || !textareaRef.current) return;
    const idx = latex.indexOf(findText, textareaRef.current.selectionEnd);
    if (idx !== -1) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = idx;
      textareaRef.current.selectionEnd = idx + findText.length;
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(latex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const jumpToSection = (lineNum: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    setHighlightedLine(lineNum);
    setTimeout(() => { scrollToLine(ta, lineNum); updateCursorPos(); }, 50);
  };

  const handlePdfDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "SPAN" && target.closest(".react-pdf__Page__textContent")) {
      const word = window.getSelection()?.toString().trim() || target.textContent?.trim() || "";
      if (!word || word.length < 3) return;
      setClickedWord(word);
      const ta = textareaRef.current;
      if (!ta) return;
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const idx = latex.search(new RegExp(escaped, "i"));
      if (idx !== -1) {
        const lineNum = latex.substring(0, idx).split("\n").length;
        setHighlightedLine(lineNum);
        setTimeout(() => { ta.focus(); ta.selectionStart = idx; ta.selectionEnd = idx + word.length; scrollToLine(ta, lineNum); updateCursorPos(); }, 50);
        setTimeout(() => setClickedWord(null), 2000);
      }
    }
  };

  const handleGenerate = async () => {
    if (!jd.trim() || !userEmail) return;
    if (pdfUrl) { window.URL.revokeObjectURL(pdfUrl); setPdfUrl(null); }
    setAppState("generating"); setErrorMsg("");
    try {
      const res = await fetch(`${API_URL}/generate/ats-check`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ email: userEmail, jd, template_id: selectedTemplate, preset_slug: presetSlug }),
      });
      if (!res.ok) { 
        if (res.status === 402) {
          setCredits(0);
          throw new Error("Out of credits! Please upgrade to continue.");
        }
        const err = await res.json(); 
        throw new Error(err.detail || "Generation failed"); 
      }
      const { latex: gen, pdf_b64, ats } = await res.json();
      setLatex(gen);
      setCredits(c => Math.max(0, c - 1));
      
      const byteCharacters = atob(pdf_b64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) { byteNumbers[i] = byteCharacters.charCodeAt(i); }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      setPdfUrl(window.URL.createObjectURL(blob));
      setAtsResult(ats);
      
      setAppState("editing"); setNumPages(0); setCurrentPage(1);
      setHasGenerated(true);
    } catch (err: any) { setErrorMsg(err.message || "Generation failed"); setAppState("error"); }
  };

  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl; a.download = "Tailored_Resume.pdf"; a.click();
  };

  const handleSaveToJob = async () => {
  if (!jobId || !latex.trim()) return;
  setSavingToJob(true);
  setSavedToJob(false);
  try {
    const res = await fetch(`${API_URL}/tracker/${jobId}/latex`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ latex }),
    });
    if (res.ok) {
      setSavedToJob(true);
      setTimeout(() => setSavedToJob(false), 3000);
    }
  } finally {
    setSavingToJob(false);
  }
  };
  
  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => setNumPages(numPages), []);
  const isBusy = appState === "generating" || appState === "compiling";
  const lineCount = latex.split("\n").length;

  // ── Pre-generation ─────────────────────────────────────────────
  if (!hasGenerated) {
    return (
      <AppLayout>
        <main className="h-full font-mono flex flex-col items-center justify-center px-6 py-16"
          style={{ background: C.bg, color: C.text }}>
          <div className="pointer-events-none fixed inset-0 opacity-[0.07] z-0"
            style={{ backgroundImage: GRAIN, backgroundRepeat: "repeat", backgroundSize: "128px" }} />
          <div className="relative z-10 w-full max-w-2xl">
            <div className="mb-10">
              <div className="flex items-center gap-3 mb-2">
                <button onClick={() => router.push("/dashboard")} className="text-xs tracking-[0.3em] uppercase hover:opacity-60 transition-opacity" style={{ color: C.green }}>← dashboard</button>
                <span className="h-px flex-1" style={{ background: C.border }} />
                <span className="text-xs" style={{ color: C.textFaint }}>v0.1</span>
              </div>
              <h1 className="text-4xl font-bold leading-none tracking-tight" style={{ fontFamily: "'Georgia', serif", letterSpacing: "-0.02em", color: C.text }}>
                Tailor Your<br /><span style={{ color: C.green }}>Resume.</span>
              </h1>
              <p className="mt-4 text-sm leading-relaxed" style={{ color: C.textMuted }}>
                Paste a job description. Gemini tailors your CV, then opens<br />a live LaTeX editor so you can fine-tune before exporting.
              </p>
              {userEmail && (
                <div className="flex items-center gap-3 mt-4">
                  <p className="text-xs" style={{ color: C.textFaint }}>Signed in as {userEmail}</p>
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm" style={{ background: C.bgCard, border: `1px solid ${C.border}` }}>
                    <span style={{ color: C.green, fontSize: "10px" }}>⚡</span>
                    <span style={{ color: C.text, fontSize: "10px", fontWeight: "bold", letterSpacing: "0.1em", textTransform: "uppercase" }}>{credits} Credits</span>
                  </div>
                </div>
              )}
            </div>
            <div className="relative mb-5">
              <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(to right, ${C.greenBorder}, transparent)` }} />
              <label className="block text-[10px] tracking-[0.25em] uppercase mb-3 mt-4" style={{ color: C.textMuted }}>Job Description</label>
              <textarea className="w-full h-56 text-sm leading-relaxed p-3 resize-none outline-none rounded-sm"
                style={{ background: C.bgCard, color: C.text, border: `1px solid ${C.border}`, caretColor: C.green }}
                placeholder="Paste the full job description here..."
                value={jd} onChange={e => setJd(e.target.value)} />
              <div className="absolute bottom-3 right-3 text-[10px]" style={{ color: C.textFaint }}>{jd.length} chars</div>
            </div>
            
            <div className="mb-6">
              <label className="block text-[10px] tracking-[0.25em] uppercase mb-3" style={{ color: C.textMuted }}>Your Role (Optional Steering)</label>
              <select 
                className="w-full p-3 text-sm outline-none rounded-sm transition-colors mb-6"
                style={{ background: C.bgCard, color: C.text, border: `1px solid ${C.border}` }}
                value={presetSlug}
                onChange={(e) => {
                  setPresetSlug(e.target.value);
                  const p = presets.find(x => x.slug === e.target.value);
                  if (p && p.recommended_template) setSelectedTemplate(p.recommended_template);
                }}
              >
                <option value="blank">Blank / Custom</option>
                {presets.map(p => (
                  <option key={p.slug} value={p.slug}>{p.display_name}</option>
                ))}
              </select>

              <label className="block text-[10px] tracking-[0.25em] uppercase mb-3" style={{ color: C.textMuted }}>Select Template</label>
              <div className="grid grid-cols-2 gap-4">
                {[
                  {id: "classic", name: "Classic Professional", desc: "Traditional single-column layout"}, 
                  {id: "modern", name: "Modern Tech", desc: "Sleek layout with clean typography and subtle color accents"}
                ].map(tpl => (
                  <div 
                    key={tpl.id} 
                    onClick={() => setSelectedTemplate(tpl.id)}
                    className="cursor-pointer rounded-sm p-3 transition-all"
                    style={{ 
                      background: selectedTemplate === tpl.id ? C.greenLight : C.bgCard, 
                      border: `1px solid ${selectedTemplate === tpl.id ? C.greenBorder : C.border}` 
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[12px] font-bold" style={{ color: selectedTemplate === tpl.id ? C.green : C.text }}>{tpl.name}</span>
                      {selectedTemplate === tpl.id && <span className="text-[10px]" style={{ color: C.green }}>✓</span>}
                    </div>
                    <p className="text-[10px] leading-relaxed" style={{ color: C.textMuted }}>{tpl.desc}</p>
                    {/* The user will add images later: <img src={`/templates/${tpl.id}.png`} className="w-full mt-2 rounded border" style={{ borderColor: C.border }} /> */}
                  </div>
                ))}
              </div>
            </div>

            {appState === "error" && (
              <div className="mb-4 px-4 py-3 text-xs rounded-sm" style={{ background: C.redBg, border: "1px solid #ffcccc", color: C.red }}>✗ {errorMsg}</div>
            )}
            <button onClick={handleGenerate} disabled={isBusy || !jd.trim()}
              className="w-full py-4 text-sm tracking-[0.15em] uppercase font-bold transition-all duration-200 rounded-sm disabled:cursor-not-allowed"
              style={{ background: isBusy || !jd.trim() ? C.border : C.text, color: isBusy || !jd.trim() ? C.textFaint : C.bg }}>
              {appState === "generating" ? (
                <span className="flex items-center justify-center gap-3">
                  <span className="inline-flex gap-1">{[0,150,300].map(d => <span key={d} className="w-1 h-1 rounded-full animate-bounce" style={{ background: C.textFaint, animationDelay: `${d}ms` }} />)}</span>
                  AI is tailoring your resume...
                </span>
              ) : "Generate & Open Editor →"}
            </button>
            <div className="mt-8 flex items-center gap-4 text-[10px] tracking-widest uppercase" style={{ color: C.textFaint }}>
              <span>Gemini</span><span>·</span><span>Go</span><span>·</span><span>LaTeX</span>
            </div>
          </div>
        </main>
      </AppLayout>
    );
  }

  // ── Editor view ────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="h-full flex flex-col overflow-hidden font-mono"
        style={{ background: C.bg, color: C.text, userSelect: isDragging ? "none" : "auto" }}>

        {/* Navbar */}
        <div className="flex items-center justify-between px-4 h-11 shrink-0" style={{ background: C.bgCard, borderBottom: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-3">
            <button onClick={() => jobId ? router.push("/tracker") : router.push("/dashboard")}
              className="text-[10px] tracking-[0.3em] uppercase hover:opacity-60 transition-opacity" style={{ color: C.green }}>
              {jobId ? "← tracker" : "← dashboard"}
            </button>
            <span style={{ color: C.border }}>│</span>
            <div className="flex items-center gap-1.5">
              <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
                <path d="M1 1H6.5L9 3.5V11H1V1Z" stroke={C.borderStrong} strokeWidth="1" />
                <path d="M6.5 1V3.5H9" stroke={C.borderStrong} strokeWidth="1" />
              </svg>
              <span className="text-[11px]" style={{ color: C.textMid }}>
                {jobLabel ? `${jobLabel} — tailored_resume.tex` : "tailored_resume.tex"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => compileLatex()} disabled={isBusy}
              className="flex items-center gap-2 px-4 py-1.5 text-[11px] font-bold tracking-[0.12em] uppercase rounded-sm transition-all disabled:cursor-not-allowed"
              style={{ background: isBusy ? C.border : C.green, color: isBusy ? C.textFaint : "#fff", border: `1px solid ${isBusy ? C.border : C.green}` }}>
              {appState === "compiling" ? (
                <span className="flex items-center gap-1.5">
                  <span className="inline-flex gap-0.5">{[0,100,200].map(d => <span key={d} className="w-1 h-1 rounded-full animate-bounce" style={{ background: C.textFaint, animationDelay: `${d}ms` }} />)}</span>
                  Compiling
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 1L7.5 4.5L1.5 8V1Z" fill="currentColor" /></svg>
                  Recompile
                </span>
              )}
            </button>
            <button onClick={handleDownload} disabled={!pdfUrl}
              className="px-3 py-1.5 text-[11px] font-bold tracking-[0.12em] uppercase rounded-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ border: `1px solid ${C.border}`, color: C.textMid }}>
              ↓ Download
            </button>
            {jobId && (
              <button
                onClick={handleSaveToJob}
                disabled={savingToJob}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold tracking-[0.12em] uppercase rounded-sm transition-all disabled:cursor-not-allowed"
                style={{
                  background: savedToJob ? C.greenLight : "transparent",
                  color: savedToJob ? C.green : savingToJob ? C.textFaint : C.textMid,
                  border: `1px solid ${savedToJob ? C.greenBorder : C.border}`,
                }}>
                {savingToJob ? (
                  <span className="flex items-center gap-1">
                    <span className="inline-flex gap-0.5">
                      {[0,100,200].map(d => (
                        <span key={d} className="w-1 h-1 rounded-full animate-bounce"
                          style={{ background: C.textFaint, animationDelay: `${d}ms` }} />
                      ))}
                    </span>
                    Saving
                  </span>
                ) : savedToJob ? (
                  <span className="flex items-center gap-1.5">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Saved
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1 2h6.5L9 3.5V9H1V2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                      <rect x="3" y="2" width="3" height="2.5" stroke="currentColor" strokeWidth="1"/>
                      <rect x="2" y="6" width="5" height="2.5" stroke="currentColor" strokeWidth="1"/>
                    </svg>
                    Save to Job
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-4">
            {appState === "error" && <span className="text-[10px]" style={{ color: C.red }}>✗ {errorMsg.slice(0, 40)}</span>}
            {appState === "editing" && (
              <span className="flex items-center gap-1.5 text-[10px]" style={{ color: C.green }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.green }} />Compiled
              </span>
            )}
            {numPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="text-[11px] disabled:opacity-20" style={{ color: C.textMid }}>←</button>
                <span className="text-[10px]" style={{ color: C.textMuted }}>{currentPage}/{numPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages} className="text-[11px] disabled:opacity-20" style={{ color: C.textMid }}>→</button>
              </div>
            )}
          </div>
        </div>

        {/* Icon Toolbar */}
        <div className="flex items-center gap-0.5 px-3 py-1.5 shrink-0" style={{ background: C.bgCard, borderBottom: `1px solid ${C.border}` }}>
          <Icon title="Bold" onClick={() => insertAround("\\textbf{", "}")}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><text x="2" y="11" fontSize="12" fontWeight="900" fontFamily="serif" fill="currentColor">B</text></svg>
          </Icon>
          <Icon title="Italic" onClick={() => insertAround("\\textit{", "}")}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><text x="3" y="11" fontSize="12" fontStyle="italic" fontFamily="serif" fill="currentColor">I</text></svg>
          </Icon>
          <Icon title="Underline" onClick={() => insertAround("\\underline{", "}")}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><text x="2" y="10" fontSize="11" fontFamily="serif" fill="currentColor">U</text><line x1="2" y1="13" x2="12" y2="13" stroke="currentColor" strokeWidth="1.5"/></svg>
          </Icon>
          <Divider />
          <Icon title="Add \section{}" onClick={() => insertAt("\\section{}", 9)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><text x="1" y="10" fontSize="9" fontWeight="700" fontFamily="monospace" fill="currentColor">§</text></svg>
          </Icon>
          <Icon title="Add \resumeItem{}" onClick={() => insertAt("\\resumeItem{}", 12)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="3" cy="7" r="1.5" fill="currentColor"/><line x1="6" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.5"/></svg>
          </Icon>
          <Icon title="Add \resumeSubheading{}{}{}{}" onClick={() => insertAt("\\resumeSubheading{}{}{}{}", 18)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="1" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth="1.5"/><line x1="1" y1="8" x2="9" y2="8" stroke="currentColor" strokeWidth="1"/><line x1="1" y1="11" x2="11" y2="11" stroke="currentColor" strokeWidth="1"/></svg>
          </Icon>
          <Icon title="Add \resumeProjectHeading{}{}" onClick={() => insertAt("\\resumeProjectHeading{\\textbf{} $|$ \\emph{}}{}", 22)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/><line x1="4" y1="5.5" x2="10" y2="5.5" stroke="currentColor" strokeWidth="1"/><line x1="4" y1="8.5" x2="8" y2="8.5" stroke="currentColor" strokeWidth="1"/></svg>
          </Icon>
          <Icon title="Add list block" onClick={() => insertAt("\\resumeItemListStart\n\\resumeItemListEnd", 20)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="3" cy="4" r="1" fill="currentColor"/><circle cx="3" cy="8" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><line x1="6" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth="1.2"/><line x1="6" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.2"/><line x1="6" y1="12" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2"/></svg>
          </Icon>
          <Icon title="Add \href{}{}" onClick={() => insertAt("\\href{}{}", 6)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 9L3 11a2 2 0 002.83 0l2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M9 5l2-2a2 2 0 00-2.83 0L6 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="5" y1="9" x2="9" y2="5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
          </Icon>
          <Divider />
          <Icon title={copied ? "Copied!" : "Copy all LaTeX"} onClick={handleCopy} active={copied}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="4" y="1" width="9" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/><rect x="1" y="4" width="9" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" fill={copied ? "currentColor" : "none"} fillOpacity="0.15"/></svg>
          </Icon>
          <Icon title="Find in code (Ctrl+F)" onClick={() => setShowFind(f => !f)} active={showFind}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.2"/><line x1="9.5" y1="9.5" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </Icon>
          <Icon title="Word wrap" onClick={() => setWordWrap(w => !w)} active={wordWrap}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="1" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth="1.2"/><path d="M1 8h8a2 2 0 010 4H7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M5 10l-2 2 2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </Icon>
          <Divider />
          <button onClick={() => setZoom(z => Math.max(70, z - 10))} className="w-6 h-6 flex items-center justify-center rounded" style={{ color: C.textMid }} title="Zoom out">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          <span className="text-[10px] w-8 text-center" style={{ color: C.textMuted }}>{zoom}%</span>
          <button onClick={() => setZoom(z => Math.min(150, z + 10))} className="w-6 h-6 flex items-center justify-center rounded" style={{ color: C.textMid }} title="Zoom in">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><line x1="6" y1="2" x2="6" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Find bar */}
        {showFind && (
          <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ background: C.greenLight, borderBottom: `1px solid ${C.greenBorder}` }}>
            <span className="text-[10px]" style={{ color: C.green }}>Find:</span>
            <input value={findText} onChange={e => setFindText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleFind()}
              placeholder="Search in code..." autoFocus
              className="flex-1 bg-transparent text-[11px] outline-none"
              style={{ color: C.text, borderBottom: `1px solid ${C.greenBorder}` }} />
            <button onClick={handleFind} className="text-[10px] px-2 py-0.5 rounded" style={{ color: C.green, border: `1px solid ${C.greenBorder}`, background: "white" }}>Next</button>
            <button onClick={() => setShowFind(false)} className="text-[10px]" style={{ color: C.textMuted }}>✕</button>
          </div>
        )}

        {/* Resizable panels */}
        <div ref={containerRef} className="flex flex-1 overflow-hidden" style={{ cursor: isDragging ? "col-resize" : "auto" }}>

          {/* Left: Editor + Sections */}
          <div className="flex flex-col overflow-hidden" style={{ width: `${splitPct}%` }}>
            <div className="flex flex-1 overflow-hidden" style={{ background: C.bgEditor }}>
              {/* Line numbers */}
              <div className="overflow-hidden shrink-0" style={{ width: "3.5rem", background: C.bgCard, borderRight: `1px solid ${C.border}` }}>
                <div style={{ paddingTop: "1rem", transform: `translateY(-${scrollTop}px)`, transition: "none" }}>
                  {Array.from({ length: lineCount }, (_, i) => (
                    <div key={i} className="text-right pr-3 text-[11px] cursor-pointer"
                      style={{ lineHeight: "1.6", color: highlightedLine === i + 1 ? "#fff" : cursorPos.line === i + 1 ? C.lineNumActive : C.lineNum, background: highlightedLine === i + 1 ? C.green : "transparent", fontFamily: "ui-monospace, monospace" }}
                      onClick={() => { if (textareaRef.current) scrollToLine(textareaRef.current, i + 1); }}>
                      {i + 1}
                    </div>
                  ))}
                </div>
              </div>

              {/* Textarea */}
              <textarea ref={textareaRef} value={latex} onChange={e => setLatex(e.target.value)}
                onScroll={e => setScrollTop((e.target as HTMLTextAreaElement).scrollTop)}
                onClick={updateCursorPos} onKeyUp={updateCursorPos}
                onKeyDown={e => {
                  updateCursorPos();
                  if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); compileLatex(); }
                  if (e.ctrlKey && e.key === "f") { e.preventDefault(); setShowFind(f => !f); }
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const ta = e.currentTarget, start = ta.selectionStart;
                    const newVal = latex.substring(0, start) + "  " + latex.substring(ta.selectionEnd);
                    setLatex(newVal);
                    setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 2; }, 0);
                  }
                }}
                className="flex-1 resize-none outline-none p-4"
                style={{ background: "transparent", color: C.editorFg, fontFamily: "ui-monospace, 'Courier New', monospace", fontSize: `${zoom / 100 * 12}px`, lineHeight: "1.6", whiteSpace: wordWrap ? "pre-wrap" : "pre", overflowX: wordWrap ? "hidden" : "auto", caretColor: C.green }}
                spellCheck={false} />
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between px-4 py-1 shrink-0" style={{ background: C.bgCard, borderTop: `1px solid ${C.border}` }}>
              <span className="text-[10px]" style={{ color: C.textMid }}>Ln {cursorPos.line}, Col {cursorPos.col}</span>
              <span className="text-[10px]" style={{ color: C.textFaint }}>{lineCount} lines · {latex.length} chars</span>
              <span className="text-[10px]" style={{ color: C.textFaint }}>Ctrl+Enter · Ctrl+F</span>
            </div>

            {/* Sections panel */}
            <div style={{ borderTop: `1px solid ${C.border}` }}>
              <button onClick={() => setSectionsOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-2 transition-colors"
                style={{ background: C.bgCard }}
                onMouseEnter={e => e.currentTarget.style.background = C.bgSnippet}
                onMouseLeave={e => e.currentTarget.style.background = C.bgCard}>
                <div className="flex items-center gap-2">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><line x1="1" y1="3" x2="11" y2="3" stroke="currentColor" strokeWidth="1.2"/><line x1="1" y1="6" x2="8" y2="6" stroke="currentColor" strokeWidth="1.2"/><line x1="1" y1="9" x2="9" y2="9" stroke="currentColor" strokeWidth="1.2"/></svg>
                  <span className="text-[10px] tracking-[0.2em] uppercase" style={{ color: C.textMid }}>
                    Sections <span style={{ color: C.textFaint }}>({sections.length})</span>
                  </span>
                </div>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                  style={{ transform: sectionsOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", color: C.textFaint }}>
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {sectionsOpen && (
                <div className="overflow-y-auto" style={{ maxHeight: "160px", background: C.bgEditor, borderTop: `1px solid ${C.border}` }}>
                  {sections.length === 0 ? (
                    <div className="px-4 py-3 text-[10px]" style={{ color: C.textFaint }}>No \section{"{}"} found</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 p-3">
                      {sections.map((sec, i) => (
                        <button key={i} onClick={() => jumpToSection(sec.line)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-sm transition-all"
                          style={{ background: C.bgCard, border: `1px solid ${C.border}`, color: C.textMid }}
                          onMouseEnter={e => { e.currentTarget.style.background = C.greenLight; e.currentTarget.style.borderColor = C.greenBorder; e.currentTarget.style.color = C.green; }}
                          onMouseLeave={e => { e.currentTarget.style.background = C.bgCard; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMid; }}>
                          <span style={{ color: C.textFaint, fontSize: "10px" }}>{i + 1}</span>
                          {sec.name}
                          <span style={{ color: C.textFaint, fontSize: "10px" }}>:{sec.line}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Drag divider */}
          <div onMouseDown={onDividerMouseDown}
            className="flex items-center justify-center shrink-0 transition-colors"
            style={{ width: "5px", cursor: "col-resize", background: isDragging ? C.greenBorder : C.border, zIndex: 10 }}
            onMouseEnter={e => { if (!isDragging) e.currentTarget.style.background = C.borderStrong; }}
            onMouseLeave={e => { if (!isDragging) e.currentTarget.style.background = C.border; }}>
            <div className="flex flex-col gap-1">
              {[0,1,2].map(i => <div key={i} className="w-1 h-1 rounded-full" style={{ background: isDragging ? "#fff" : C.borderStrong }} />)}
            </div>
          </div>

          {/* Right: PDF Preview */}
          <div className="flex flex-col overflow-hidden" style={{ flex: 1 }}>
            <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{ background: C.bgCard, borderBottom: `1px solid ${C.border}` }}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] tracking-[0.2em] uppercase" style={{ color: C.textFaint }}>Preview</span>
                <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: C.greenLight, color: C.green, border: `1px solid ${C.greenBorder}` }}>
                  Double-click text to jump to editor
                </span>
                {atsResult && (
                  <div className="relative group flex items-center ml-2">
                    {atsResult.pass ? (
                       <span className="text-[10px] px-2 py-0.5 rounded cursor-help font-bold tracking-wider" style={{ background: C.greenLight, color: C.green, border: `1px solid ${C.greenBorder}` }}>ATS: PASS</span>
                    ) : (
                       <span className="text-[10px] px-2 py-0.5 rounded cursor-help font-bold tracking-wider" style={{ background: C.redBg, color: C.red, border: "1px solid #ffcccc" }}>ATS: WARNINGS</span>
                    )}
                    {atsResult.warnings.length > 0 && (
                      <div className="absolute top-full mt-2 left-0 w-64 p-3 bg-[#1a1814] text-[#f5f2ed] text-[10px] rounded shadow-lg hidden group-hover:block z-50">
                        <ul className="list-disc pl-4 space-y-1">
                          {atsResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                {clickedWord && <span className="text-[10px]" style={{ color: C.green }}>→ "{clickedWord}"</span>}
                {numPages > 0 && <span className="text-[10px]" style={{ color: C.textFaint }}>{numPages}p</span>}
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: appState === "editing" ? C.green : appState === "error" ? C.red : C.borderStrong }} />
                  <span className="text-[10px]" style={{ color: C.textMuted }}>tailored_resume.pdf</span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto flex items-start justify-center py-8 px-6"
              style={{ background: "#e8e4dd" }} onDoubleClick={handlePdfDoubleClick}>
              {appState === "compiling" && (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <div className="flex gap-2">{[0,150,300].map(d => <span key={d} className="w-2 h-2 rounded-full animate-bounce" style={{ background: C.green, animationDelay: `${d}ms` }} />)}</div>
                  <p className="text-[10px] tracking-widest uppercase" style={{ color: C.textMuted }}>Compiling LaTeX...</p>
                </div>
              )}
              {!isBusy && pdfUrl && (
                <div style={{ filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.18))", cursor: "text" }}>
                  <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess}
                    loading={<div className="flex items-center justify-center h-40 text-[10px] uppercase" style={{ color: C.textMuted }}>Loading...</div>}
                    error={<div className="flex items-center justify-center h-40 text-[11px]" style={{ color: C.red }}>Failed to render</div>}>
                    <Page pageNumber={currentPage} renderTextLayer={true} renderAnnotationLayer={true}
                      width={Math.min(700, (window.innerWidth * (1 - splitPct / 100)) - 60)} />
                  </Document>
                </div>
              )}
              {!isBusy && !pdfUrl && appState === "error" && (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <span className="text-sm" style={{ color: C.red }}>✗ Compilation Error</span>
                  <span className="text-[11px] max-w-xs text-center" style={{ color: C.textMuted }}>{errorMsg}</span>
                  <button onClick={() => compileLatex()} className="mt-2 px-4 py-1.5 text-[11px] rounded"
                    style={{ border: `1px solid ${C.greenBorder}`, color: C.green, background: C.greenLight }}>
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={null}>
      <GeneratePageContent />
    </Suspense>
  );
}
