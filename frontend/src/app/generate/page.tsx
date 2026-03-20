"use client";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`;

export default function GeneratePage() {
  const router = useRouter();
  const [jd, setJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "generating" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    fetch("http://localhost:8000/auth/me", { credentials: "include" })
      .then(res => { if (!res.ok) { router.push("/login"); return null; } return res.json(); })
      .then(data => { if (data) setUserEmail(data.email); })
      .catch(() => router.push("/login"));
  }, []);

  const handleGenerate = async () => {
    if (!jd.trim() || !userEmail) return;
    if (pdfUrl) { window.URL.revokeObjectURL(pdfUrl); setPdfUrl(null); }
    setLoading(true); setStatus("generating"); setErrorMsg(""); setNumPages(0); setCurrentPage(1);

    try {
      const res = await fetch("http://localhost:8000/generate/cv", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ email: userEmail, jd }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Generation failed"); }
      const { latex } = await res.json();

      const pdfRes = await fetch("http://localhost:8081/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex }),
      });
      if (!pdfRes.ok) {
        try { const err = await pdfRes.json(); throw new Error(err.details || err.error || "PDF compilation failed"); }
        catch { throw new Error("PDF compilation failed"); }
      }

      const blob = await pdfRes.blob();
      setPdfUrl(window.URL.createObjectURL(blob));
      setStatus("success");
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong");
      setStatus("error");
    } finally { setLoading(false); }
  };

  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a"); a.href = pdfUrl; a.download = "Tailored_Resume.pdf"; a.click();
  };

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => setNumPages(numPages), []);

  const isDisabled = loading || !jd.trim();

  return (
    <main className="min-h-screen bg-[#f5f2ed] text-[#1a1814] font-mono">
      <div className="pointer-events-none fixed inset-0 opacity-[0.07] z-0"
        style={{ backgroundImage: GRAIN, backgroundRepeat: "repeat", backgroundSize: "128px" }} />

      <div className={`relative z-10 flex transition-all duration-500 ease-in-out ${pdfUrl ? "flex-row h-screen" : "flex-col items-center justify-center min-h-screen px-6 py-16"}`}>

        {/* Left Panel */}
        <div className={`transition-all duration-500 ease-in-out flex flex-col justify-center ${pdfUrl ? "w-[420px] min-w-[420px] h-full px-10 py-12 border-r border-[#d4cfc7] overflow-y-auto bg-[#f5f2ed]" : "w-full max-w-2xl"}`}>

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
            {!pdfUrl && (
              <p className="mt-4 text-[#7a7570] text-sm leading-relaxed">
                Paste a job description. The AI reads your profile,<br />
                rewrites your CV to match, and compiles a PDF.
              </p>
            )}
            {userEmail && <p className="mt-2 text-[#b0aba4] text-xs">Signed in as {userEmail}</p>}
          </div>

          {/* JD Input */}
          <div className="relative mb-5">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-[#c8f060] via-[#c8f06044] to-transparent" />
            <label className="block text-[10px] tracking-[0.25em] text-[#7a7570] uppercase mb-3 mt-4">
              Job Description
            </label>
            <textarea
              className="w-full bg-[#e8e4dd] text-[#1a1814] text-sm leading-relaxed p-3 resize-none outline-none border border-[#d4cfc7] focus:border-[#c8f06088] rounded-sm placeholder-[#b0aba4] transition-colors duration-200"
              style={{ height: pdfUrl ? "200px" : "224px" }}
              placeholder="Paste the full job description here..."
              value={jd}
              onChange={(e) => { setJd(e.target.value); if (status !== "idle") setStatus("idle"); }}
            />
            <div className="absolute bottom-3 right-3 text-[10px] text-[#b0aba4]">{jd.length} chars</div>
          </div>

          {status === "error" && (
            <div className="mb-4 px-4 py-3 bg-[#ffeaea] border border-[#ffcccc] text-[#cc3333] text-xs rounded-sm">
              ✗ {errorMsg}
            </div>
          )}

          <button onClick={handleGenerate} disabled={isDisabled}
            className="relative w-full py-4 text-sm tracking-[0.15em] uppercase font-bold transition-all duration-200 rounded-sm overflow-hidden group disabled:cursor-not-allowed"
            style={{ background: isDisabled ? "#d4cfc7" : "#1a1814", color: isDisabled ? "#b0aba4" : "#f5f2ed" }}>
            {!isDisabled && <span className="absolute inset-0 bg-white opacity-0 group-hover:opacity-5 transition-opacity duration-200" />}
            {loading ? (
              <span className="flex items-center justify-center gap-3">
                <span className="inline-flex gap-1">
                  <span className="w-1 h-1 bg-[#7a7570] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-1 bg-[#7a7570] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1 h-1 bg-[#7a7570] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
                Generating — this may take a minute
              </span>
            ) : pdfUrl ? "Regenerate →" : "Generate Tailored PDF →"}
          </button>

          {pdfUrl && (
            <button onClick={handleDownload}
              className="mt-3 w-full py-3 text-sm tracking-[0.15em] uppercase font-bold border border-[#5a8a0044] text-[#5a8a00] hover:bg-[#c8f06022] transition-colors duration-200 rounded-sm">
              ↓ Download PDF
            </button>
          )}

          <div className="mt-8 flex items-center gap-4 text-[#b0aba4] text-[10px] tracking-widest uppercase">
            <span>FastAPI</span><span>·</span><span>Qwen2.5</span><span>·</span>
            <span>Go</span><span>·</span><span>LaTeX</span>
          </div>
        </div>

        {/* Right Panel — PDF Preview */}
        {pdfUrl && (
          <div className="flex-1 h-full bg-[#eeebe5] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3 border-b border-[#d4cfc7] shrink-0 bg-[#f5f2ed]">
              <span className="text-[10px] tracking-[0.25em] text-[#b0aba4] uppercase">Preview</span>
              <div className="flex items-center gap-4">
                {numPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
                      className="text-[#b0aba4] hover:text-[#5a8a00] disabled:opacity-30 transition-colors text-xs">←</button>
                    <span className="text-[10px] text-[#7a7570]">{currentPage} / {numPages}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages}
                      className="text-[#b0aba4] hover:text-[#5a8a00] disabled:opacity-30 transition-colors text-xs">→</button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#5a8a00]" />
                  <span className="text-[10px] text-[#7a7570]">tailored_resume.pdf</span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto flex items-start justify-center py-8 px-4">
              <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess}
                loading={<div className="flex items-center justify-center h-40 text-[#b0aba4] text-xs tracking-widest uppercase">Loading preview...</div>}
                error={<div className="flex items-center justify-center h-40 text-[#cc3333] text-xs">Failed to load PDF preview</div>}>
                <Page pageNumber={currentPage} renderTextLayer={true} renderAnnotationLayer={true}
                  className="shadow-xl" width={Math.min(750, window.innerWidth - 480)} />
              </Document>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}