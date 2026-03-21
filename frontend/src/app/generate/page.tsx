"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`;

type AppState = "idle" | "generating" | "editing" | "compiling" | "error";

// LaTeX snippet shortcuts
const SNIPPETS = [
  { label: "Bold", insert: "\\textbf{}", cursorOffset: 9 },
  { label: "Italic", insert: "\\textit{}", cursorOffset: 9 },
  { label: "Section", insert: "\\section{}", cursorOffset: 9 },
  { label: "Item", insert: "\\resumeItem{}", cursorOffset: 12 },
  { label: "Subheading", insert: "\\resumeSubheading{}{}{}{}", cursorOffset: 18 },
  { label: "Project", insert: "\\resumeProjectHeading{\\textbf{} $|$ \\emph{}}{}", cursorOffset: 22 },
  { label: "List Start", insert: "\\resumeItemListStart\n\\resumeItemListEnd", cursorOffset: 20 },
  { label: "href", insert: "\\href{}{}", cursorOffset: 6 },
];

function LineNumbers({ code, scrollTop }: { code: string; scrollTop: number }) {
  const lines = code.split("\n").length;
  return (
    <div
      className="select-none text-right pr-3 pt-4 text-[11px] leading-[1.6] font-mono shrink-0"
      style={{
        color: "#3a3530",
        width: "3rem",
        transform: `translateY(-${scrollTop}px)`,
        transition: "none",
        minHeight: "100%",
      }}
    >
      {Array.from({ length: lines }, (_, i) => (
        <div key={i + 1}>{i + 1}</div>
      ))}
    </div>
  );
}

export default function GeneratePage() {
  const router = useRouter();
  const [jd, setJd] = useState("");
  const [latex, setLatex] = useState("");
  const [latexHistory, setLatexHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [appState, setAppState] = useState<AppState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [hasGenerated, setHasGenerated] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [zoom, setZoom] = useState(100);
  const [findText, setFindText] = useState("");
  const [showFind, setShowFind] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("http://localhost:8000/auth/me", { credentials: "include" })
      .then(res => { if (!res.ok) { router.push("/login"); return null; } return res.json(); })
      .then(data => { if (data) setUserEmail(data.email); })
      .catch(() => router.push("/login"));
  }, []);

  // Track cursor position
  const updateCursorPos = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const text = ta.value.substring(0, ta.selectionStart);
    const lines = text.split("\n");
    setCursorPos({ line: lines.length, col: lines[lines.length - 1].length + 1 });
  };

  // Push to history for undo
  const pushHistory = (val: string) => {
    setLatexHistory(h => [...h.slice(0, historyIndex + 1), val].slice(-50));
    setHistoryIndex(i => Math.min(i + 1, 49));
  };

  const handleLatexChange = (val: string) => {
    setLatex(val);
    pushHistory(val);
  };

  // Insert snippet at cursor
  const insertSnippet = (insert: string, cursorOffset: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newVal = latex.substring(0, start) + insert + latex.substring(end);
    handleLatexChange(newVal);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = start + cursorOffset;
      ta.selectionEnd = start + cursorOffset;
    }, 0);
  };

  // Find & highlight
  const handleFind = () => {
    if (!findText || !textareaRef.current) return;
    const idx = latex.indexOf(findText, textareaRef.current.selectionEnd);
    if (idx !== -1) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = idx;
      textareaRef.current.selectionEnd = idx + findText.length;
    }
  };

  const handleGenerate = async () => {
    if (!jd.trim() || !userEmail) return;
    if (pdfUrl) { window.URL.revokeObjectURL(pdfUrl); setPdfUrl(null); }
    setAppState("generating");
    setErrorMsg("");

    try {
      const res = await fetch("http://localhost:8000/generate/cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: userEmail, jd }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Generation failed"); }
      const { latex: generatedLatex } = await res.json();
      setLatex(generatedLatex);
      setLatexHistory([generatedLatex]);
      setHistoryIndex(0);
      await compileLatex(generatedLatex);
      setHasGenerated(true);
    } catch (err: any) {
      setErrorMsg(err.message || "Generation failed");
      setAppState("error");
    }
  };

  const compileLatex = async (latexSource?: string) => {
    const source = latexSource ?? latex;
    if (!source.trim()) return;
    if (pdfUrl) { window.URL.revokeObjectURL(pdfUrl); setPdfUrl(null); }
    setAppState("compiling");
    setErrorMsg("");

    try {
      const pdfRes = await fetch("http://localhost:8081/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex: source }),
      });

      if (!pdfRes.ok) {
        try { const err = await pdfRes.json(); throw new Error(err.details || err.error || "Compilation failed"); }
        catch { throw new Error("Compilation failed"); }
      }

      const blob = await pdfRes.blob();
      setPdfUrl(window.URL.createObjectURL(blob));
      setAppState("editing");
      setNumPages(0);
      setCurrentPage(1);
    } catch (err: any) {
      setErrorMsg(err.message || "Compilation failed");
      setAppState("error");
    }
  };

  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = "Tailored_Resume.pdf";
    a.click();
  };

  const copyLatex = () => {
    navigator.clipboard.writeText(latex);
  };

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  }, []);

  const isBusy = appState === "generating" || appState === "compiling";
  const lineCount = latex.split("\n").length;
  const wordCount = latex.split(/\s+/).filter(Boolean).length;

  // Pre-generation view
  if (!hasGenerated) {
    return (
      <main className="min-h-screen bg-[#f5f2ed] text-[#1a1814] font-mono flex flex-col items-center justify-center px-6 py-16">
        <div className="pointer-events-none fixed inset-0 opacity-[0.07] z-0"
          style={{ backgroundImage: GRAIN, backgroundRepeat: "repeat", backgroundSize: "128px" }} />

        <div className="relative z-10 w-full max-w-2xl">
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-2">
              <button onClick={() => router.push("/dashboard")}
                className="text-[#5a8a00] text-xs tracking-[0.3em] uppercase hover:opacity-70 transition-opacity">
                ← dashboard
              </button>
              <span className="h-px flex-1 bg-[#d4cfc7]" />
              <span className="text-[#b0aba4] text-xs">v0.1</span>
            </div>
            <h1 className="text-4xl font-bold leading-none tracking-tight text-[#1a1814]"
              style={{ fontFamily: "'Georgia', serif", letterSpacing: "-0.02em" }}>
              Tailor Your<br />
              <span className="text-[#5a8a00]">Resume.</span>
            </h1>
            <p className="mt-4 text-[#7a7570] text-sm leading-relaxed">
              Paste a job description. Gemini tailors your CV, then opens<br />
              a live LaTeX editor so you can fine-tune before exporting.
            </p>
            {userEmail && <p className="mt-2 text-[#b0aba4] text-xs">Signed in as {userEmail}</p>}
          </div>

          <div className="relative mb-5">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-[#c8f060] via-[#c8f06044] to-transparent" />
            <label className="block text-[10px] tracking-[0.25em] text-[#7a7570] uppercase mb-3 mt-4">
              Job Description
            </label>
            <textarea
              className="w-full h-56 bg-[#e8e4dd] text-[#1a1814] text-sm leading-relaxed p-3 resize-none outline-none border border-[#d4cfc7] focus:border-[#c8f06088] rounded-sm placeholder-[#b0aba4] transition-colors duration-200"
              placeholder="Paste the full job description here..."
              value={jd}
              onChange={e => setJd(e.target.value)}
            />
            <div className="absolute bottom-3 right-3 text-[10px] text-[#b0aba4]">{jd.length} chars</div>
          </div>

          {appState === "error" && (
            <div className="mb-4 px-4 py-3 bg-[#ffeaea] border border-[#ffcccc] text-[#cc3333] text-xs rounded-sm">
              ✗ {errorMsg}
            </div>
          )}

          <button onClick={handleGenerate} disabled={isBusy || !jd.trim()}
            className="w-full py-4 text-sm tracking-[0.15em] uppercase font-bold transition-all duration-200 rounded-sm disabled:cursor-not-allowed"
            style={{ background: isBusy || !jd.trim() ? "#d4cfc7" : "#1a1814", color: isBusy || !jd.trim() ? "#b0aba4" : "#f5f2ed" }}>
            {appState === "generating" ? (
              <span className="flex items-center justify-center gap-3">
                <span className="inline-flex gap-1">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-1 h-1 bg-[#7a7570] rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </span>
                AI is tailoring your resume...
              </span>
            ) : "Generate & Open Editor →"}
          </button>

          <div className="mt-8 flex items-center gap-4 text-[#b0aba4] text-[10px] tracking-widest uppercase">
            <span>Gemini</span><span>·</span><span>Go</span><span>·</span><span>LaTeX</span>
          </div>
        </div>
      </main>
    );
  }

  // Post-generation: Overleaf-style editor
  return (
    <main className="h-screen flex flex-col overflow-hidden" style={{ background: "#0f0d0b", color: "#d4cfc7", fontFamily: "ui-monospace, 'Courier New', monospace" }}>

      {/* ── Top navbar ── */}
      <div className="flex items-center justify-between px-4 h-11 border-b shrink-0"
        style={{ borderColor: "#1e1a17", background: "#0a0806" }}>

        {/* Left: branding + file */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")}
            className="text-[10px] tracking-[0.3em] uppercase transition-opacity hover:opacity-60"
            style={{ color: "#5a8a00" }}>
            ← cv_tailor
          </button>
          <span style={{ color: "#1e1a17" }}>│</span>
          <div className="flex items-center gap-1.5">
            <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
              <path d="M1 1H6.5L9 3.5V11H1V1Z" stroke="#3a3530" strokeWidth="1" />
              <path d="M6.5 1V3.5H9" stroke="#3a3530" strokeWidth="1" />
            </svg>
            <span className="text-[11px]" style={{ color: "#4a4540" }}>tailored_resume.tex</span>
          </div>
        </div>

        {/* Center: recompile + download */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => compileLatex()}
            disabled={isBusy}
            className="flex items-center gap-2 px-4 py-1.5 text-[11px] font-bold tracking-[0.12em] uppercase rounded transition-all duration-150 disabled:cursor-not-allowed"
            style={{
              background: isBusy ? "#1a1714" : "#4a7a00",
              color: isBusy ? "#3a3530" : "#e8f5c0",
              border: "1px solid",
              borderColor: isBusy ? "#2a2520" : "#5a8a00",
            }}>
            {appState === "compiling" ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-flex gap-0.5">
                  {[0, 100, 200].map(d => (
                    <span key={d} className="w-1 h-1 rounded-full animate-bounce" style={{ background: "#3a3530", animationDelay: `${d}ms` }} />
                  ))}
                </span>
                Compiling
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 1.5L8 5L2 8.5V1.5Z" fill="currentColor" />
                </svg>
                Recompile
              </span>
            )}
          </button>

          <button onClick={handleDownload} disabled={!pdfUrl}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold tracking-[0.12em] uppercase rounded transition-all duration-150 disabled:opacity-20 disabled:cursor-not-allowed"
            style={{ border: "1px solid #2a2520", color: "#5a5550", background: "transparent" }}
            onMouseEnter={e => { if (pdfUrl) { (e.target as HTMLElement).style.borderColor = "#5a8a0055"; (e.target as HTMLElement).style.color = "#5a8a00"; } }}
            onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = "#2a2520"; (e.target as HTMLElement).style.color = "#5a5550"; }}>
            ↓ Download
          </button>
        </div>

        {/* Right: status + page nav */}
        <div className="flex items-center gap-4">
          {appState === "error" && (
            <span className="text-[10px]" style={{ color: "#cc4444" }}>✗ {errorMsg.slice(0, 40)}</span>
          )}
          {appState === "editing" && (
            <span className="flex items-center gap-1.5 text-[10px]" style={{ color: "#5a8a00" }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#5a8a00" }} />
              Compiled
            </span>
          )}
          {numPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
                className="text-[11px] transition-colors disabled:opacity-20"
                style={{ color: "#4a4540" }}>←</button>
              <span className="text-[10px]" style={{ color: "#3a3530" }}>{currentPage}/{numPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages}
                className="text-[11px] transition-colors disabled:opacity-20"
                style={{ color: "#4a4540" }}>→</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Editor column ── */}
        <div className="flex flex-col" style={{ width: "50%", borderRight: "1px solid #1a1714" }}>

          {/* Editor toolbar */}
          <div className="flex items-center gap-1 px-3 py-1.5 shrink-0 overflow-x-auto"
            style={{ background: "#0d0b09", borderBottom: "1px solid #1a1714" }}>

            {/* Snippet buttons */}
            {SNIPPETS.map(s => (
              <button key={s.label}
                onClick={() => insertSnippet(s.insert, s.cursorOffset)}
                className="px-2 py-1 text-[10px] rounded shrink-0 transition-colors duration-100"
                style={{ color: "#5a5550", background: "#151210", border: "1px solid #222" }}
                onMouseEnter={e => { (e.currentTarget).style.color = "#c8e090"; (e.currentTarget).style.borderColor = "#3a4a20"; }}
                onMouseLeave={e => { (e.currentTarget).style.color = "#5a5550"; (e.currentTarget).style.borderColor = "#222"; }}>
                {s.label}
              </button>
            ))}

            <div style={{ width: "1px", background: "#1e1a17", margin: "0 4px", height: "16px", flexShrink: 0 }} />

            {/* Utility buttons */}
            <button onClick={copyLatex}
              className="px-2 py-1 text-[10px] rounded shrink-0 transition-colors"
              style={{ color: "#5a5550", background: "#151210", border: "1px solid #222" }}
              onMouseEnter={e => { (e.currentTarget).style.color = "#c8e090"; }}
              onMouseLeave={e => { (e.currentTarget).style.color = "#5a5550"; }}
              title="Copy all LaTeX">
              Copy
            </button>

            <button onClick={() => setShowFind(f => !f)}
              className="px-2 py-1 text-[10px] rounded shrink-0 transition-colors"
              style={{ color: showFind ? "#c8e090" : "#5a5550", background: showFind ? "#1a2a10" : "#151210", border: `1px solid ${showFind ? "#3a4a20" : "#222"}` }}
              title="Find in code">
              Find
            </button>

            <button onClick={() => setWordWrap(w => !w)}
              className="px-2 py-1 text-[10px] rounded shrink-0 transition-colors"
              style={{ color: wordWrap ? "#c8e090" : "#5a5550", background: wordWrap ? "#1a2a10" : "#151210", border: `1px solid ${wordWrap ? "#3a4a20" : "#222"}` }}
              title="Toggle word wrap">
              Wrap
            </button>

            <div style={{ width: "1px", background: "#1e1a17", margin: "0 4px", height: "16px", flexShrink: 0 }} />

            {/* Zoom */}
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => setZoom(z => Math.max(70, z - 10))}
                className="w-5 h-5 flex items-center justify-center text-[10px] rounded"
                style={{ color: "#5a5550", background: "#151210", border: "1px solid #222" }}>−</button>
              <span className="text-[10px] w-8 text-center" style={{ color: "#3a3530" }}>{zoom}%</span>
              <button onClick={() => setZoom(z => Math.min(150, z + 10))}
                className="w-5 h-5 flex items-center justify-center text-[10px] rounded"
                style={{ color: "#5a5550", background: "#151210", border: "1px solid #222" }}>+</button>
            </div>
          </div>

          {/* Find bar */}
          {showFind && (
            <div className="flex items-center gap-2 px-3 py-2 shrink-0"
              style={{ background: "#0d0b09", borderBottom: "1px solid #1a1714" }}>
              <input
                value={findText}
                onChange={e => setFindText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleFind()}
                placeholder="Find in code..."
                className="flex-1 bg-transparent text-[11px] outline-none"
                style={{ color: "#c8e090", borderBottom: "1px solid #3a4a20" }}
              />
              <button onClick={handleFind}
                className="text-[10px] px-2 py-0.5 rounded"
                style={{ color: "#5a8a00", border: "1px solid #3a4a20" }}>
                Next
              </button>
              <button onClick={() => setShowFind(false)}
                className="text-[10px]" style={{ color: "#3a3530" }}>✕</button>
            </div>
          )}

          {/* Editor with line numbers */}
          <div ref={editorRef} className="flex flex-1 overflow-hidden" style={{ background: "#0f0d0b" }}>
            {/* Line numbers */}
            <div className="overflow-hidden shrink-0" style={{ width: "3rem", background: "#0a0806", borderRight: "1px solid #1a1714" }}>
              <div style={{ paddingTop: "1rem", transform: `translateY(-${scrollTop}px)` }}>
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i} className="text-right pr-3 text-[11px] leading-[1.6]"
                    style={{ color: cursorPos.line === i + 1 ? "#4a5a30" : "#2a2520" }}>
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={latex}
              onChange={e => handleLatexChange(e.target.value)}
              onScroll={e => setScrollTop((e.target as HTMLTextAreaElement).scrollTop)}
              onClick={updateCursorPos}
              onKeyUp={updateCursorPos}
              onKeyDown={e => {
                updateCursorPos();
                if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); compileLatex(); }
                if (e.ctrlKey && e.key === "f") { e.preventDefault(); setShowFind(f => !f); }
                if (e.key === "Tab") {
                  e.preventDefault();
                  const ta = e.currentTarget;
                  const start = ta.selectionStart;
                  const end = ta.selectionEnd;
                  const newVal = latex.substring(0, start) + "  " + latex.substring(end);
                  handleLatexChange(newVal);
                  setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 2; }, 0);
                }
              }}
              className="flex-1 resize-none outline-none p-4 text-[11px] leading-[1.6]"
              style={{
                background: "transparent",
                color: "#c8c4be",
                fontFamily: "ui-monospace, 'Courier New', monospace",
                fontSize: `${zoom / 100 * 11}px`,
                whiteSpace: wordWrap ? "pre-wrap" : "pre",
                overflowX: wordWrap ? "hidden" : "auto",
                caretColor: "#5a8a00",
              }}
              spellCheck={false}
            />
          </div>

          {/* Status bar */}
          <div className="flex items-center justify-between px-4 py-1.5 shrink-0"
            style={{ background: "#0a0806", borderTop: "1px solid #1a1714" }}>
            <div className="flex items-center gap-4">
              <span className="text-[10px]" style={{ color: "#3a3530" }}>
                Ln {cursorPos.line}, Col {cursorPos.col}
              </span>
              <span className="text-[10px]" style={{ color: "#2a2520" }}>
                {lineCount} lines · {wordCount} words · {latex.length} chars
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px]" style={{ color: "#2a2520" }}>LaTeX</span>
              <span className="text-[10px]" style={{ color: "#2a2520" }}>Ctrl+Enter to compile · Ctrl+F to find</span>
            </div>
          </div>
        </div>

        {/* ── Right: PDF Preview ── */}
        <div className="flex flex-col" style={{ width: "50%", background: "#13110e" }}>

          {/* Preview header */}
          <div className="flex items-center justify-between px-4 py-2 shrink-0"
            style={{ background: "#0a0806", borderBottom: "1px solid #1a1714" }}>
            <div className="flex items-center gap-2">
              <span className="text-[10px] tracking-[0.2em] uppercase" style={{ color: "#2a2520" }}>Preview</span>
            </div>
            <div className="flex items-center gap-4">
              {appState === "compiling" && (
                <span className="text-[10px]" style={{ color: "#4a5a30" }}>Compiling...</span>
              )}
              {numPages > 0 && (
                <span className="text-[10px]" style={{ color: "#3a3530" }}>{numPages} page{numPages > 1 ? "s" : ""}</span>
              )}
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: appState === "editing" ? "#5a8a00" : appState === "error" ? "#cc4444" : "#3a3530" }} />
                <span className="text-[10px]" style={{ color: "#3a3530" }}>tailored_resume.pdf</span>
              </div>
            </div>
          </div>

          {/* PDF area */}
          <div className="flex-1 overflow-auto flex items-start justify-center py-8 px-6"
            style={{ background: "#13110e" }}>

            {appState === "compiling" && (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="flex gap-2">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-2 h-2 rounded-full animate-bounce"
                      style={{ background: "#5a8a00", animationDelay: `${d}ms` }} />
                  ))}
                </div>
                <p className="text-[10px] tracking-widest uppercase" style={{ color: "#3a3530" }}>
                  Compiling LaTeX...
                </p>
              </div>
            )}

            {!isBusy && pdfUrl && (
              <div style={{ filter: "drop-shadow(0 8px 32px rgba(0,0,0,0.6))" }}>
                <Document
                  file={pdfUrl}
                  onLoadSuccess={onDocumentLoadSuccess}
                  loading={
                    <div className="flex items-center justify-center h-40 text-[10px] tracking-widest uppercase" style={{ color: "#3a3530" }}>
                      Loading...
                    </div>
                  }
                  error={
                    <div className="flex items-center justify-center h-40 text-[11px]" style={{ color: "#cc4444" }}>
                      Failed to render PDF
                    </div>
                  }
                >
                  <Page
                    pageNumber={currentPage}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    width={Math.min(660, window.innerWidth / 2 - 48)}
                  />
                </Document>
              </div>
            )}

            {!isBusy && !pdfUrl && appState === "error" && (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <span className="text-sm" style={{ color: "#cc4444" }}>✗ Compilation Error</span>
                <span className="text-[11px] max-w-xs text-center" style={{ color: "#3a3530" }}>{errorMsg}</span>
                <button onClick={() => compileLatex()}
                  className="mt-2 px-4 py-1.5 text-[11px] rounded"
                  style={{ border: "1px solid #3a4a20", color: "#5a8a00" }}>
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}