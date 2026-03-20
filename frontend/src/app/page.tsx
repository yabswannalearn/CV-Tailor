"use client";
import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Required: point to the pdf.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function ResumeGenerator() {
  const [email, setEmail] = useState("reinaelyabut.work@gmail.com");
  const [jd, setJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "generating" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const handleGenerate = async () => {
    if (!jd.trim() || !email.trim()) return;

    if (pdfUrl) {
      window.URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }

    setLoading(true);
    setStatus("generating");
    setErrorMsg("");
    setNumPages(0);
    setCurrentPage(1);

    try {
      const res = await fetch("http://localhost:8000/generate/cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, jd }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Generation failed");
      }

      const { latex } = await res.json();

      const pdfRes = await fetch("http://localhost:8081/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex }),
      });

      if (!pdfRes.ok) {
        try {
          const err = await pdfRes.json();
          throw new Error(err.details || err.error || "PDF compilation failed");
        } catch {
          throw new Error("PDF compilation failed");
        }
      }

      const blob = await pdfRes.blob();
      const url = window.URL.createObjectURL(blob);
      setPdfUrl(url);
      setStatus("success");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Something went wrong");
      setStatus("error");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = "Tailored_Resume.pdf";
    a.click();
  };

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  }, []);

  return (
    <main className="min-h-screen bg-[#0c0c0c] text-[#f0ede6] font-mono">

      {/* Grain overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03] z-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "128px",
        }}
      />

      <div className={`relative z-10 flex transition-all duration-500 ease-in-out ${pdfUrl ? "flex-row h-screen" : "flex-col items-center justify-center min-h-screen px-6 py-16"}`}>

        {/* Left Panel — Input */}
        <div className={`transition-all duration-500 ease-in-out flex flex-col justify-center ${pdfUrl ? "w-[420px] min-w-[420px] h-full px-10 py-12 border-r border-[#1a1a1a] overflow-y-auto" : "w-full max-w-2xl"}`}>

          {/* Header */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[#c8f060] text-xs tracking-[0.3em] uppercase">cv_tailor</span>
              <span className="h-px flex-1 bg-[#222]" />
              <span className="text-[#333] text-xs">v0.1</span>
            </div>
            <h1
              className="text-4xl font-bold leading-none tracking-tight"
              style={{ fontFamily: "'Georgia', serif", letterSpacing: "-0.02em" }}
            >
              Tailor Your
              <br />
              <span className="text-[#c8f060]">Resume.</span>
            </h1>
            {!pdfUrl && (
              <p className="mt-4 text-[#555] text-sm leading-relaxed">
                Paste a job description. The AI reads your profile,<br />
                rewrites your CV to match, and compiles a PDF.
              </p>
            )}
          </div>

          {/* Email Input */}
          <div className="relative mb-5">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-[#c8f060] via-[#c8f06033] to-transparent" />
            <label className="block text-[10px] tracking-[0.25em] text-[#444] uppercase mb-3 mt-4">
              Profile Email
            </label>
            <input
              type="email"
              className="w-full bg-[#111] text-[#f0ede6] text-sm p-3 outline-none border border-[#1e1e1e] focus:border-[#c8f06055] rounded-sm placeholder-[#2a2a2a] transition-colors duration-200"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* JD Input */}
          <div className="relative mb-5">
            <label className="block text-[10px] tracking-[0.25em] text-[#444] uppercase mb-3">
              Job Description
            </label>
            <textarea
              className="w-full bg-[#111] text-[#f0ede6] text-sm leading-relaxed p-3 resize-none outline-none border border-[#1e1e1e] focus:border-[#c8f06055] rounded-sm placeholder-[#2a2a2a] transition-colors duration-200"
              style={{ height: pdfUrl ? "200px" : "224px" }}
              placeholder="Paste the full job description here..."
              value={jd}
              onChange={(e) => {
                setJd(e.target.value);
                if (status !== "idle") setStatus("idle");
              }}
            />
            <div className="absolute bottom-3 right-3 text-[10px] text-[#2a2a2a]">
              {jd.length} chars
            </div>
          </div>

          {/* Status messages */}
          {status === "error" && (
            <div className="mb-4 px-4 py-3 bg-[#1a0a0a] border border-[#3a1a1a] text-[#ff6b6b] text-xs rounded-sm">
              ✗ {errorMsg}
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={loading || !jd.trim() || !email.trim()}
            className="relative w-full py-4 text-sm tracking-[0.15em] uppercase font-bold transition-all duration-200 rounded-sm overflow-hidden group disabled:cursor-not-allowed"
            style={{
              background: loading || !jd.trim() || !email.trim() ? "#1a1a1a" : "#c8f060",
              color: loading || !jd.trim() || !email.trim() ? "#333" : "#0c0c0c",
            }}
          >
            {!loading && jd.trim() && email.trim() && (
              <span className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-200" />
            )}
            {loading ? (
              <span className="flex items-center justify-center gap-3">
                <span className="inline-flex gap-1">
                  <span className="w-1 h-1 bg-[#555] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-1 bg-[#555] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1 h-1 bg-[#555] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
                Generating — this may take a minute
              </span>
            ) : pdfUrl ? (
              "Regenerate →"
            ) : (
              "Generate Tailored PDF →"
            )}
          </button>

          {/* Download button */}
          {pdfUrl && (
            <button
              onClick={handleDownload}
              className="mt-3 w-full py-3 text-sm tracking-[0.15em] uppercase font-bold border border-[#c8f06044] text-[#c8f060] hover:bg-[#c8f06011] transition-colors duration-200 rounded-sm"
            >
              ↓ Download PDF
            </button>
          )}

          {/* Footer */}
          <div className="mt-8 flex items-center gap-4 text-[#2a2a2a] text-[10px] tracking-widest uppercase">
            <span>FastAPI</span>
            <span>·</span>
            <span>Qwen2.5</span>
            <span>·</span>
            <span>Go</span>
            <span>·</span>
            <span>LaTeX</span>
          </div>
        </div>

        {/* Right Panel — PDF Preview */}
        {pdfUrl && (
          <div className="flex-1 h-full bg-[#161616] flex flex-col overflow-hidden">

            {/* Preview toolbar */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-[#1a1a1a] shrink-0">
              <span className="text-[10px] tracking-[0.25em] text-[#444] uppercase">Preview</span>
              <div className="flex items-center gap-4">
                {/* Page controls */}
                {numPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="text-[#444] hover:text-[#c8f060] disabled:opacity-20 transition-colors text-xs"
                    >
                      ←
                    </button>
                    <span className="text-[10px] text-[#444]">
                      {currentPage} / {numPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
                      disabled={currentPage >= numPages}
                      className="text-[#444] hover:text-[#c8f060] disabled:opacity-20 transition-colors text-xs"
                    >
                      →
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#c8f060]" />
                  <span className="text-[10px] text-[#444]">tailored_resume.pdf</span>
                </div>
              </div>
            </div>

            {/* PDF render area */}
            <div className="flex-1 overflow-auto flex items-start justify-center py-8 px-4">
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={
                  <div className="flex items-center justify-center h-40 text-[#444] text-xs tracking-widest uppercase">
                    Loading preview...
                  </div>
                }
                error={
                  <div className="flex items-center justify-center h-40 text-[#ff6b6b] text-xs">
                    Failed to load PDF preview
                  </div>
                }
              >
                <Page
                  pageNumber={currentPage}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  className="shadow-2xl"
                  width={Math.min(750, window.innerWidth - 480)}
                />
              </Document>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}