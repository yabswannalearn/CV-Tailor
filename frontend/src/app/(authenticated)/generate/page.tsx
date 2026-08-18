"use client";
import { Suspense, useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { API_URL, getApiError } from "@/lib/api";
import { useResumeUiStore } from "@/lib/uiStore";
import InlineQueryError from "@/components/InlineQueryError";
import RouteLoading from "@/components/RouteLoading";
import Alert from "@/components/Alert";
import { ButtonLink } from "@/components/Button";
import { ApiQueryError, queryKeys, type JobDetails, useCurrentUser, usePresets, useProfile, useTrackerDetails } from "@/lib/queries";
import { formatEducationDetails, parseResumeDraft, replaceCommandArgument, replaceFirst, replaceNthMatch, replaceResumeItem, type ResumeDraft } from "@/lib/resumeDraft";

const Document = dynamic(() => import("react-pdf").then(m => m.Document), { ssr: false });
const Page = dynamic(() => import("react-pdf").then(m => m.Page), { ssr: false });
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });
const PDF_WORKER_SRC = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

if (typeof window !== "undefined") {
  import("react-pdf").then(({ pdfjs }) => {
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
  }).catch(() => {});
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
type EditorMode = "friendly" | "preview" | "source";

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

const ViewToggle = ({ mode, onChange }: { mode: EditorMode; onChange: (mode: EditorMode) => void }) => (
  <div className="flex items-center rounded-lg border p-0.5" style={{ borderColor: C.border, background: "#f2eee8" }}>
    {([
      ["friendly", "Edit"],
      ["preview", "Preview"],
      ["source", "LaTeX"],
    ] as [EditorMode, string][]).map(([value, label]) => (
      <button key={value} onClick={() => onChange(value)} className="rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
        style={{ background: mode === value ? "#fffdf9" : "transparent", color: mode === value ? C.green : C.textMuted, boxShadow: mode === value ? "0 1px 3px rgba(40,32,20,0.12)" : "none" }}>
        {label}
      </button>
    ))}
  </div>
);

// ── Shared editor-header action buttons (used identically by Edit / Preview / LaTeX views) ──
const CopyLatexButton = ({ copied, onClick }: { copied: boolean; onClick: () => void }) => (
  <button onClick={onClick}
    className="px-3 py-1.5 text-[11px] font-bold tracking-[0.12em] uppercase rounded-sm transition-all border"
    style={{ borderColor: C.border, color: copied ? C.green : C.textMid, background: copied ? C.greenLight : C.bgCard }}>
    {copied ? "Copied!" : "Copy LaTeX"}
  </button>
);

const SaveToJobButton = ({ savingToJob, savedToJob, onClick }: { savingToJob: boolean; savedToJob: boolean; onClick: () => void }) => (
  <button onClick={onClick} disabled={savingToJob}
    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold tracking-[0.12em] uppercase rounded-sm transition-all disabled:cursor-not-allowed"
    style={{
      background: savedToJob ? C.greenLight : "transparent",
      color: savedToJob ? C.green : savingToJob ? C.textFaint : C.textMid,
      border: `1px solid ${savedToJob ? C.greenBorder : C.border}`,
    }}>
    {savingToJob ? (
      <span className="flex items-center gap-1">
        <span className="inline-flex gap-0.5">
          {[0, 100, 200].map(d => <span key={d} className="w-1 h-1 rounded-full animate-bounce" style={{ background: C.textFaint, animationDelay: `${d}ms` }} />)}
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
);

const CoverLetterActionButton = ({ available, busy, onClick }: { available: boolean; busy: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={busy}
    aria-label={available ? "Open saved cover letter" : "Generate a cover letter for this application"}
    className="flex items-center gap-2 rounded-sm border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] transition-all hover:-translate-y-px hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ab030] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none"
    style={{ background: C.text, borderColor: C.text, color: "#fffdf9" }}>
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 1.5h5.5L10 4v6.5H2v-9Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
      <path d="M7.5 1.5V4H10M4 6h4M4 8h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
    {busy ? "Writing..." : available ? "Open Cover Letter" : "Generate Cover Letter"}
  </button>
);

type CoverLetterEditorProps = {
  companyName: string;
  jobTitle: string;
  text: string;
  error: string;
  generating: boolean;
  saving: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onGenerate: () => void;
  onSave: () => void;
};

const CoverLetterEditor = ({
  companyName, jobTitle, text, error, generating, saving,
  onChange, onClose, onGenerate, onSave,
}: CoverLetterEditorProps) => {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !generating && !saving) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [generating, onClose, saving]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(26,24,20,0.66)" }}
      onMouseDown={event => { if (event.target === event.currentTarget && !generating && !saving) onClose(); }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cover-letter-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border shadow-2xl"
        style={{ background: "#fffdf9", borderColor: C.border }}>
        <header className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4 sm:px-7" style={{ background: C.bgCard, borderColor: C.border }}>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: C.green }} />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: C.green }}>Application document</p>
            </div>
            <h2 id="cover-letter-title" className="truncate text-xl font-semibold" style={{ fontFamily: "Georgia, serif", color: C.text }}>{companyName} cover letter</h2>
            <p className="mt-1 truncate text-xs" style={{ color: C.textMuted }}>{jobTitle} · saved with this application</p>
          </div>
          <button type="button" onClick={onClose} disabled={generating || saving} aria-label="Close cover letter editor"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ab030] disabled:opacity-40"
            style={{ color: C.textMuted }}>×</button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:p-6">
          {error && <div role="alert" className="rounded-md border px-3 py-2 text-xs" style={{ background: C.redBg, borderColor: "#ffcccc", color: C.red }}>{error}</div>}
          <div className="relative min-h-[360px] flex-1">
            <textarea
              autoFocus
              value={text}
              onChange={event => onChange(event.target.value)}
              disabled={generating}
              aria-label="Cover letter"
              className="h-full min-h-[360px] w-full resize-none rounded-lg border p-4 text-sm leading-7 outline-none transition-colors focus:border-[#8ab030] focus:ring-2 focus:ring-[#e8f5c0] disabled:opacity-40 sm:p-5"
              style={{ background: C.bgEditor, borderColor: C.border, color: C.text, fontFamily: "Georgia, serif" }}
            />
            {generating && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg" style={{ background: "rgba(249,247,244,0.9)" }} aria-live="polite">
                <div className="text-center">
                  <span className="mb-3 inline-flex gap-1">
                    {[0, 150, 300].map(delay => <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full motion-reduce:animate-none" style={{ background: C.green, animationDelay: `${delay}ms` }} />)}
                  </span>
                  <p className="text-sm font-semibold" style={{ color: C.text }}>Writing a tailored draft...</p>
                  <p className="mt-1 text-xs" style={{ color: C.textMuted }}>Using this role and your profile</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 text-[11px]" style={{ color: C.textFaint }}>
            <span>{text.length.toLocaleString()} characters</span>
            <span>Changes are saved to this application</span>
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-6" style={{ background: C.bgCard, borderColor: C.border }}>
          <button type="button" onClick={onGenerate} disabled={generating || saving}
            className="rounded-sm border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ab030] disabled:opacity-40"
            style={{ borderColor: C.borderStrong, color: C.textMid }}>
            {text.trim() ? "Regenerate draft" : "Generate draft"}
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} disabled={generating || saving}
              className="rounded-sm px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ab030] disabled:opacity-40"
              style={{ color: C.textMuted }}>Cancel</button>
            <button type="button" onClick={onSave} disabled={generating || saving || !text.trim()}
              className="rounded-sm px-5 py-2 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ab030] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: C.green, color: "#fff" }}>
              {saving ? "Saving..." : "Save Cover Letter"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
};

const RecompileButton = ({ busy, onClick }: { busy: boolean; onClick: () => void }) => (
  <button onClick={onClick} disabled={busy}
    className="flex items-center gap-2 px-4 py-1.5 text-[11px] font-bold tracking-[0.12em] uppercase rounded-sm transition-all disabled:cursor-not-allowed"
    style={{ background: busy ? C.border : C.green, color: busy ? C.textFaint : "#fff", border: `1px solid ${busy ? C.border : C.green}` }}>
    {busy ? (
      <span className="flex items-center gap-1.5">
        <span className="inline-flex gap-0.5">
          {[0, 100, 200].map(d => <span key={d} className="w-1 h-1 rounded-full animate-bounce" style={{ background: C.textFaint, animationDelay: `${d}ms` }} />)}
        </span>
        Compiling
      </span>
    ) : (
      <span className="flex items-center gap-1.5">
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 1L7.5 4.5L1.5 8V1Z" fill="currentColor"/></svg>
        Recompile
      </span>
    )}
  </button>
);

type DownloadMenuProps = {
  hasPdf: boolean;
  hasLatex: boolean;
  downloadingDocx: boolean;
  onDownloadPdf: () => void;
  onDownloadDocx: () => void;
  onDownloadTex: () => void;
};
const DownloadMenu = ({ hasPdf, hasLatex, downloadingDocx, onDownloadPdf, onDownloadDocx, onDownloadTex }: DownloadMenuProps) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const disabled = !hasPdf && !hasLatex;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const download = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <div ref={menuRef} className="relative inline-block text-left">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className="px-3 py-1.5 text-[11px] font-bold tracking-[0.12em] uppercase rounded-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
        style={{ border: `1px solid ${open ? C.text : C.border}`, color: C.textMid, background: open ? "#fffdf9" : C.bgCard }}>
        <span>Download</span>
        <svg width="8" height="5" viewBox="0 0 10 6" fill="none" aria-hidden="true" className="transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }}>
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && <div role="menu" className="absolute right-0 top-full mt-1 w-44 rounded-md shadow-lg z-50 border py-1"
           style={{ background: "#fffdf9", borderColor: C.border }}>
        <button type="button" role="menuitem" onClick={() => download(onDownloadPdf)} disabled={!hasPdf}
          className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-[#f0ebe3] flex items-center justify-between transition-colors disabled:opacity-30"
          style={{ color: C.textMid }}>
          <span>PDF Document</span><span className="text-[10px]" style={{ color: C.textFaint }}>.pdf</span>
        </button>
        <button type="button" role="menuitem" onClick={() => download(onDownloadDocx)} disabled={downloadingDocx || !hasLatex}
          className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-[#f0ebe3] flex items-center justify-between transition-colors disabled:opacity-30"
          style={{ color: C.textMid }}>
          <span>{downloadingDocx ? "Generating..." : "Word Document"}</span><span className="text-[10px]" style={{ color: C.textFaint }}>.docx</span>
        </button>
        <button type="button" role="menuitem" onClick={() => download(onDownloadTex)} disabled={!hasLatex}
          className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-[#f0ebe3] flex items-center justify-between transition-colors disabled:opacity-30"
          style={{ color: C.textMid }}>
          <span>LaTeX Source</span><span className="text-[10px]" style={{ color: C.textFaint }}>.tex</span>
        </button>
      </div>}
    </div>
  );
};

const IconMore = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <line x1="2" y1="4" x2="12" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <line x1="2" y1="10" x2="12" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

type EditorHeaderProps = {
  eyebrow: string;
  title: string;
  backHref: string;
  backLabel: string;
  jobId: string | null;
  copied: boolean;
  onCopy: () => void;
  savingToJob: boolean;
  savedToJob: boolean;
  onSaveToJob: () => void;
  coverLetterAvailable: boolean;
  coverLetterBusy: boolean;
  onCoverLetter: () => void;
  busy: boolean;
  onRecompile: () => void;
  hasPdf: boolean;
  hasLatex: boolean;
  downloadingDocx: boolean;
  onDownloadPdf: () => void;
  onDownloadDocx: () => void;
  onDownloadTex: () => void;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  extra?: React.ReactNode;
};

const EditorHeader = ({
  eyebrow, title, backHref, backLabel, jobId,
  copied, onCopy, savingToJob, savedToJob, onSaveToJob,
  coverLetterAvailable, coverLetterBusy, onCoverLetter,
  busy, onRecompile, hasPdf, hasLatex, downloadingDocx,
  onDownloadPdf, onDownloadDocx, onDownloadTex,
  mode, onModeChange, extra,
}: EditorHeaderProps) => {
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-7 sm:py-4" style={{ background: "#fffdf9", borderColor: C.border }}>
      <div className="flex items-center gap-4 min-w-0">
        <Link href={backHref} prefetch className="shrink-0 text-[10px] font-semibold tracking-[0.3em] uppercase hover:opacity-60 transition-opacity" style={{ color: C.green }}>{backLabel}</Link>
        <div className="h-5 w-px shrink-0" style={{ background: C.border }} />
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: C.textFaint }}>{eyebrow}</p>
          <h1 className="text-[11px] sm:text-lg font-semibold line-clamp-2 leading-snug" style={{ fontFamily: "Georgia, serif" }}>{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-2">
          {extra}
          <CopyLatexButton copied={copied} onClick={onCopy} />
          <DownloadMenu hasPdf={hasPdf} hasLatex={hasLatex} downloadingDocx={downloadingDocx} onDownloadPdf={onDownloadPdf} onDownloadDocx={onDownloadDocx} onDownloadTex={onDownloadTex} />
          {jobId && <SaveToJobButton savingToJob={savingToJob} savedToJob={savedToJob} onClick={onSaveToJob} />}
          {jobId && <CoverLetterActionButton available={coverLetterAvailable} busy={coverLetterBusy} onClick={onCoverLetter} />}
        </div>

        <RecompileButton busy={busy} onClick={onRecompile} />

        <div className="relative sm:hidden">
          <button onClick={() => setMoreOpen(o => !o)} aria-label="More actions" aria-expanded={moreOpen}
            className="w-8 h-8 flex items-center justify-center rounded-sm border transition-all"
            style={{ borderColor: C.border, color: C.textMid, background: C.bgCard }}>
            <IconMore />
          </button>
          {moreOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} aria-hidden="true" />
              <div className="absolute right-0 top-full mt-2 w-48 rounded-md shadow-lg z-50 border py-1"
                style={{ background: "#fffdf9", borderColor: C.border }}>
                <button onClick={() => { onCopy(); setMoreOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-[#f0ebe3] transition-colors" style={{ color: C.textMid }}>
                  {copied ? "Copied!" : "Copy LaTeX"}
                </button>
                {jobId && (
                  <>
                    <button onClick={() => { onSaveToJob(); setMoreOpen(false); }} disabled={savingToJob}
                      className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-[#f0ebe3] transition-colors disabled:opacity-40" style={{ color: C.textMid }}>
                      {savedToJob ? "Saved!" : savingToJob ? "Saving..." : "Save to Job"}
                    </button>
                    <button onClick={() => { onCoverLetter(); setMoreOpen(false); }} disabled={coverLetterBusy}
                      className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-[#f0ebe3] transition-colors disabled:opacity-40" style={{ color: C.green }}>
                      {coverLetterBusy ? "Writing cover letter..." : coverLetterAvailable ? "Open Cover Letter" : "Generate Cover Letter"}
                    </button>
                  </>
                )}
                <div className="my-1 border-t" style={{ borderColor: C.border }} />
                <button onClick={() => { onDownloadPdf(); setMoreOpen(false); }} disabled={!hasPdf}
                  className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-[#f0ebe3] flex items-center justify-between transition-colors disabled:opacity-30" style={{ color: C.textMid }}>
                  <span>Download PDF</span><span className="text-[10px]" style={{ color: C.textFaint }}>.pdf</span>
                </button>
                <button onClick={() => { onDownloadDocx(); setMoreOpen(false); }} disabled={downloadingDocx || !hasLatex}
                  className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-[#f0ebe3] flex items-center justify-between transition-colors disabled:opacity-30" style={{ color: C.textMid }}>
                  <span>{downloadingDocx ? "Generating..." : "Download Word"}</span><span className="text-[10px]" style={{ color: C.textFaint }}>.docx</span>
                </button>
                <button onClick={() => { onDownloadTex(); setMoreOpen(false); }} disabled={!hasLatex}
                  className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-[#f0ebe3] flex items-center justify-between transition-colors disabled:opacity-30" style={{ color: C.textMid }}>
                  <span>Download LaTeX</span><span className="text-[10px]" style={{ color: C.textFaint }}>.tex</span>
                </button>
              </div>
            </>
          )}
        </div>

        <ViewToggle mode={mode} onChange={onModeChange} />
      </div>
    </header>
  );
};

function GeneratePageContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job_id");
  const userQuery = useCurrentUser();
  const profileQuery = useProfile();
  const presetsQuery = usePresets();
  const jobDetailsQuery = useTrackerDetails(jobId ? Number(jobId) : null);

  const [jd, setJd] = useState("");
  const { selectedTemplate, setSelectedTemplate, editorMode, setEditorMode } = useResumeUiStore();
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
  const [draft, setDraft] = useState<ResumeDraft>({ name: "", summary: "", bullets: [], sections: [] });
  const [draftReady, setDraftReady] = useState(false);
  const [autoCompile, setAutoCompile] = useState(true);
  const [useMonaco, setUseMonaco] = useState(true);
  const [editorTheme, setEditorTheme] = useState<"vs-dark" | "vs">("vs-dark");
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [jobLatexLoading, setJobLatexLoading] = useState(Boolean(jobId));
  const [jobLatexError, setJobLatexError] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [coverLetterOpen, setCoverLetterOpen] = useState(false);
  const [coverLetterGenerating, setCoverLetterGenerating] = useState(false);
  const [coverLetterSaving, setCoverLetterSaving] = useState(false);
  const [coverLetterError, setCoverLetterError] = useState("");

  const handleDownloadTex = () => {
    if (!latex) return;
    const blob = new Blob([latex], { type: "text/x-tex;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = jobLabel ? `${jobLabel.replace(/[^a-z0-9_-]/gi, "_")}_resume.tex` : "tailored_resume.tex";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadDocx = async () => {
    if (!latex) return;
    setDownloadingDocx(true);
    try {
      const res = await fetch(`${API_URL}/generate/export/docx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex }),
      });
      if (!res.ok) throw new Error("Failed to generate DOCX");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = jobLabel ? `${jobLabel.replace(/[^a-z0-9_-]/gi, "_")}_resume.docx` : "tailored_resume.docx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download docx", err);
    } finally {
      setDownloadingDocx(false);
    }
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);
  const lastCompiledLatexRef = useRef<string>("");
  const compileInFlightRef = useRef(false);
  const pendingCompileRef = useRef<{ source: string; checkAts: boolean } | null>(null);
  const compileLatexRef = useRef<(src?: string, checkAts?: boolean) => Promise<void>>(async () => {});

  // ── compile helper (defined before useEffect so it can be called from it) ──
  const compileLatex = useCallback(async (src?: string, checkAts = true) => {
    const source = src ?? latex;
    if (!source.trim()) return;

    if (compileInFlightRef.current) {
      pendingCompileRef.current = { source, checkAts };
      return;
    }

    compileInFlightRef.current = true;
    setAppState("compiling"); setErrorMsg("");
    try {
      const endpoint = checkAts ? "/generate/compile-with-check" : "/generate/compile-preview";
      const res = await fetch(`${API_URL}${endpoint}`, {
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

      let blob: Blob;
      let pages: number;
      if (checkAts) {
        const { pdf_b64, ats, num_pages } = await res.json();
        const bytes = Uint8Array.from(atob(pdf_b64), char => char.charCodeAt(0));
        blob = new Blob([bytes], { type: "application/pdf" });
        pages = num_pages;
        setAtsResult(ats);
      } else {
        blob = await res.blob();
        pages = Number(res.headers.get("X-PDF-Pages") || "1");
      }

      const newBlobUrl = window.URL.createObjectURL(blob);
      lastCompiledLatexRef.current = source;
      setPdfUrl(prevUrl => {
        if (prevUrl) window.URL.revokeObjectURL(prevUrl);
        return newBlobUrl;
      });
      setAppState("editing");
      if (pages) setNumPages(pages);
      setCurrentPage(1);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Compile failed");
      setAppState("error");
    } finally {
      compileInFlightRef.current = false;
      const pending = pendingCompileRef.current;
      pendingCompileRef.current = null;
      if (pending && pending.source !== source) {
        window.setTimeout(() => compileLatexRef.current(pending.source, pending.checkAts), 0);
      }
    }
  }, [latex]);

  useEffect(() => {
    compileLatexRef.current = compileLatex;
  }, [compileLatex]);

  // ── Debounced Auto-compilation Effect (800ms) ──
  useEffect(() => {
    if (!autoCompile || !latex.trim()) return;
    if (latex === lastCompiledLatexRef.current) return;

    const timer = setTimeout(() => {
      compileLatexRef.current(latex, false);
    }, 800);

    return () => clearTimeout(timer);
  }, [latex, autoCompile]);

  const loadJobLatex = useCallback(async () => {
    if (!jobId) {
      setJobLatexLoading(false);
      return;
    }
    setJobLatexLoading(true);
    setJobLatexError("");
    try {
      const response = await fetch(`${API_URL}/tracker/${jobId}/latex`, { credentials: "include" });
      if (!response.ok) {
        if (response.status === 404) return;
        throw new Error("We couldn’t load the saved resume for this application.");
      }
      const data = await response.json();
      if (data?.latex) {
        setLatex(data.latex);
        setHasGenerated(true);
        window.setTimeout(() => { void compileLatexRef.current(data.latex); }, 100);
      }
    } catch (error) {
      setJobLatexError(error instanceof Error ? error.message : "We couldn’t load the saved resume.");
    } finally {
      setJobLatexLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void loadJobLatex();
  }, [loadJobLatex]);

  useEffect(() => {
    if (userQuery.isError) router.replace("/login");
    if (userQuery.data) {
      setUserEmail(userQuery.data.email);
      setCredits(userQuery.data.credits);
    }
  }, [router, userQuery.data, userQuery.isError]);

  useEffect(() => {
    if (profileQuery.data?.preset_slug) setPresetSlug(profileQuery.data.preset_slug);
  }, [profileQuery.data]);

  useEffect(() => {
    if (presetsQuery.data) setPresets(presetsQuery.data.map(preset => ({
      slug: preset.slug,
      display_name: preset.display_name,
      recommended_template: preset.recommended_template || "classic",
    })));
  }, [presetsQuery.data]);

  useEffect(() => {
    if (jobDetailsQuery.data) {
      setJobLabel(`${jobDetailsQuery.data.company_name} — ${jobDetailsQuery.data.job_title}`);
      setCoverLetter(jobDetailsQuery.data.cover_letter || "");
    }
  }, [jobDetailsQuery.data]);

  useEffect(() => { 
    setSections(parseSections(latex));
    if (hasGenerated && !draftReady && latex) {
      setDraft(parseResumeDraft(latex));
      setDraftReady(true);
    }
  }, [latex, hasGenerated, draftReady]);

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
      lastCompiledLatexRef.current = gen;
      setLatex(gen);
      setDraftReady(false);
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
    } catch (err: unknown) { setErrorMsg(err instanceof Error ? err.message : "Generation failed"); setAppState("error"); }
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

  const generateCoverLetter = async () => {
    if (!jobId) return;
    setCoverLetterOpen(true);
    setCoverLetterGenerating(true);
    setCoverLetterError("");
    try {
      const response = await fetch(`${API_URL}/tracker/${jobId}/generate-cover-letter`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await getApiError(response, "Unable to generate a cover letter."));
      const data = await response.json() as { cover_letter: string };
      setCoverLetter(data.cover_letter);
      const numericJobId = Number(jobId);
      queryClient.setQueryData<JobDetails>(queryKeys.trackerDetails(numericJobId), current => current ? { ...current, cover_letter: data.cover_letter } : current);
    } catch (error) {
      setCoverLetterError(error instanceof Error ? error.message : "Unable to generate a cover letter.");
    } finally {
      setCoverLetterGenerating(false);
    }
  };

  const handleCoverLetterAction = () => {
    setCoverLetterError("");
    if (coverLetter.trim()) setCoverLetterOpen(true);
    else void generateCoverLetter();
  };

  const handleSaveCoverLetter = async () => {
    if (!jobId || !coverLetter.trim()) return;
    setCoverLetterSaving(true);
    setCoverLetterError("");
    try {
      const response = await fetch(`${API_URL}/tracker/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cover_letter: coverLetter }),
      });
      if (!response.ok) throw new Error(await getApiError(response, "Unable to save the cover letter."));
      const updatedJob = await response.json() as JobDetails;
      setCoverLetter(updatedJob.cover_letter || coverLetter);
      queryClient.setQueryData(queryKeys.trackerDetails(Number(jobId)), updatedJob);
      setCoverLetterOpen(false);
    } catch (error) {
      setCoverLetterError(error instanceof Error ? error.message : "Unable to save the cover letter.");
    } finally {
      setCoverLetterSaving(false);
    }
  };
  
  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => setNumPages(numPages), []);
  const isBusy = appState === "generating" || appState === "compiling";
  const lineCount = latex.split("\n").length;
  const coverLetterEditor = coverLetterOpen && jobId ? (
    <CoverLetterEditor
      companyName={jobDetailsQuery.data?.company_name || "Application"}
      jobTitle={jobDetailsQuery.data?.job_title || "Tailored role"}
      text={coverLetter}
      error={coverLetterError}
      generating={coverLetterGenerating}
      saving={coverLetterSaving}
      onChange={setCoverLetter}
      onClose={() => setCoverLetterOpen(false)}
      onGenerate={() => { void generateCoverLetter(); }}
      onSave={() => { void handleSaveCoverLetter(); }}
    />
  ) : null;

  const updateDraft = (key: "name" | "summary", value: string) => {
    setDraft(d => ({ ...d, [key]: value }));
    if (key === "name") {
      setLatex(current => {
        if (/\\textcolor\{[^}]+\}\{([^{}]+)\}/.test(current)) {
          return replaceFirst(current, /\\textcolor\{[^}]+\}\{([^{}]+)\}/, `\\textcolor{NavyBlue}{${value}}`);
        }
        return replaceFirst(current, /(\\Huge\s*\{?)[^{}\\]+(\}?)/, `$1${value}$2`);
      });
    } else {
      setLatex(current => {
        const pattern = /(\\section\*?\{[^{}]*(?:Summary|Profile|Objective)[^{}]*\}[\s\S]*?)(?=\\section|\\end\{document\})/i;
        if (pattern.test(current)) {
          return current.replace(pattern, (match) => {
            const headerMatch = match.match(/\\section\*?\{[^{}]*\}/i);
            const header = headerMatch ? headerMatch[0] : "\\section{Summary}";
            return `${header}\n{\\small ${value}\\par}\n`;
          });
        }
        return current;
      });
    }
  };

  const updateBullet = (index: number, value: string) => {
    setDraft(d => ({ ...d, bullets: d.bullets.map((b, i) => i === index ? value : b) }));
    setLatex(current => replaceResumeItem(current, index, value));
  };

  const updateEntry = (sectionName: string, entry: ResumeDraft["sections"][number]["entries"][number], field: "title" | "subtitle" | "meta" | "description", value: string) => {
    const isEducation = sectionName.trim().toLowerCase() === "education";
    setDraft(d => ({
      ...d,
      sections: d.sections.map(section => section.name === sectionName
        ? { ...section, entries: section.entries.map(item => item === entry ? { ...item, [field]: value } : item) }
        : section),
    }));
    if (entry.command === "resumeSubheading") {
      if (isEducation && (field === "subtitle" || field === "description")) {
        const course = field === "subtitle" ? value : entry.subtitle;
        const description = field === "description" ? value : entry.description;
        setLatex(current => replaceCommandArgument(current, entry.command, entry.occurrence, 2, formatEducationDetails(course, description)));
      } else if (field !== "description") {
        const fieldIndex = field === "title" ? 0 : field === "subtitle" ? 2 : 1;
        setLatex(current => {
          if (field !== "meta" || isEducation) {
            return replaceCommandArgument(current, entry.command, entry.occurrence, fieldIndex, value);
          }
          const [location, ...dateParts] = value.split(" · ");
          const withLocation = replaceCommandArgument(current, entry.command, entry.occurrence, 1, location);
          return replaceCommandArgument(withLocation, entry.command, entry.occurrence, 3, dateParts.join(" · "));
        });
      }
    } else {
      const fieldIndex = field === "meta" ? 1 : 0;
      setLatex(current => replaceCommandArgument(current, entry.command, entry.occurrence, fieldIndex, value));
    }
  };

  const updateSectionDetail = (sectionName: string, detail: ResumeDraft["sections"][number]["details"][number], value: string) => {
    setDraft(d => ({
      ...d,
      sections: d.sections.map(section => section.name === sectionName
        ? { ...section, details: section.details.map(item => item.index === detail.index ? { ...item, value } : item) }
        : section),
    }));
    setLatex(current => {
      const section = draft.sections.find(item => item.name === sectionName);
      if (section?.detailType === "skills") {
        return replaceNthMatch(current, /\\textbf\{([^{}]*)\}\{\s*:\s*([^{}]*)\}/g, detail.index, (full: string) => {
          const label = full.match(/\\textbf\{([^{}]*)\}/)?.[1] || detail.label;
          return "\\textbf{" + label + "}{: " + value.replace(/[{}]/g, "") + "}";
        });
      }
      if (section?.detailType === "certifications") {
        return replaceNthMatch(current, /\\item\{([^{}]*)\}/g, detail.index, "\\item{" + value.replace(/[{}]/g, "") + "}");
      }
      return current;
    });
  };

  // ── Pre-generation ─────────────────────────────────────────────
  const profileNotFound = profileQuery.error instanceof ApiQueryError && profileQuery.error.status === 404;
  const startupLoading = userQuery.isPending || profileQuery.isPending || presetsQuery.isPending || jobLatexLoading || (Boolean(jobId) && jobDetailsQuery.isPending);
  const startupError = jobLatexError
    || (!profileNotFound && profileQuery.error instanceof Error ? profileQuery.error.message : "")
    || (presetsQuery.error instanceof Error ? presetsQuery.error.message : "")
    || (jobDetailsQuery.error instanceof Error ? jobDetailsQuery.error.message : "");
  if (startupLoading) return <RouteLoading />;
  if (profileNotFound) {
    return (
      <div className="p-6 sm:p-10">
        <Alert>
          <p>Complete your profile before generating a tailored resume.</p>
          <ButtonLink variant="outline" href="/dashboard" className="mt-3">
            Complete your profile
          </ButtonLink>
        </Alert>
      </div>
    );
  }
  if (startupError) return <div className="p-6 sm:p-10"><InlineQueryError message={startupError} onRetry={() => { void loadJobLatex(); void profileQuery.refetch(); void presetsQuery.refetch(); void jobDetailsQuery.refetch(); }} /></div>;

  if (!hasGenerated) {
    return (
      <main className="min-h-full font-mono flex flex-col items-center justify-start md:justify-center px-6 py-8 md:py-16"
          style={{ background: C.bg, color: C.text }}>
          <div className="pointer-events-none fixed inset-0 opacity-[0.07] z-0"
            style={{ backgroundImage: GRAIN, backgroundRepeat: "repeat", backgroundSize: "128px" }} />
          <div className="relative z-10 w-full max-w-2xl">
            <div className="mb-10">
              <div className="flex items-center gap-3 mb-2">
                <Link href="/dashboard" prefetch className="text-xs tracking-[0.3em] uppercase hover:opacity-60 transition-opacity" style={{ color: C.green }}>← dashboard</Link>
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
              <input 
                list="generate-presets"
                className="w-full p-3 text-sm outline-none rounded-sm transition-colors mb-6"
                style={{ background: C.bgCard, color: C.text, border: `1px solid ${C.border}` }}
                value={presetSlug === 'blank' ? '' : presetSlug}
                onChange={(e) => {
                  const val = e.target.value;
                  setPresetSlug(val || 'blank');
                  const p = presets.find(x => x.display_name.toLowerCase() === val.toLowerCase());
                   if (p?.recommended_template === "classic" || p?.recommended_template === "modern") {
                     setSelectedTemplate(p.recommended_template);
                   }
                }}
                placeholder="e.g. Full Stack Developer, Marketing Manager..."
              />
              <datalist id="generate-presets">
                {presets.map(p => (
                  <option key={p.slug} value={p.display_name} />
                ))}
              </datalist>

              <label className="block text-[10px] tracking-[0.25em] uppercase mb-3" style={{ color: C.textMuted }}>Select Template</label>
              <div className="grid grid-cols-2 gap-4">
                {[
                  {id: "classic", name: "Classic Professional", desc: "Traditional single-column layout"}, 
                  {id: "modern", name: "Modern Tech", desc: "Sleek layout with clean typography and subtle color accents"}
                ].map(tpl => (
                  <div 
                    key={tpl.id} 
                    onClick={() => setSelectedTemplate(tpl.id as "classic" | "modern")}
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
    );
  }

  if (editorMode === "friendly") {
    return (
      <div className="flex h-full min-h-0 flex-col" style={{ background: "#f7f5f0", color: C.text }}>
          <EditorHeader
            eyebrow="Resume editor"
            title={jobLabel || "Tailored resume"}
            backHref={jobId ? "/tracker" : "/dashboard"}
            backLabel={jobId ? "← tracker" : "← dashboard"}
            jobId={jobId}
            copied={copied}
            onCopy={handleCopy}
            savingToJob={savingToJob}
            savedToJob={savedToJob}
            onSaveToJob={handleSaveToJob}
            coverLetterAvailable={Boolean(coverLetter.trim())}
            coverLetterBusy={coverLetterGenerating}
            onCoverLetter={handleCoverLetterAction}
            busy={isBusy}
            onRecompile={() => compileLatex()}
            hasPdf={!!pdfUrl}
            hasLatex={!!latex}
            downloadingDocx={downloadingDocx}
            onDownloadPdf={handleDownload}
            onDownloadDocx={handleDownloadDocx}
            onDownloadTex={handleDownloadTex}
            mode={editorMode}
            onModeChange={setEditorMode}
          />
          {coverLetterEditor}

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
            <section className="w-full shrink-0 px-4 py-6 sm:px-5 lg:w-[53%] lg:flex-1 lg:overflow-y-auto lg:px-10 lg:py-7">
              <div className="mx-auto max-w-2xl">
                <div className="mb-7">
                  <div className="mb-2 flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: C.green }} /><span className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: C.green }}>Step 1 of 1</span></div>
                  <h2 className="text-3xl font-semibold" style={{ fontFamily: "Georgia, serif" }}>Make it yours.</h2>
                  <p className="mt-2 max-w-lg text-sm leading-6" style={{ color: C.textMuted }}>Edit the words you want to change. The layout and formatting are handled for you.</p>
                </div>

                <div className="space-y-5">
                  <div className="rounded-xl border p-5 shadow-[0_8px_30px_rgba(40,32,20,0.04)]" style={{ background: "#fffdf9", borderColor: C.border }}>
                    <div className="mb-4 flex items-start justify-between"><div><h3 className="font-semibold">Header</h3><p className="mt-1 text-xs" style={{ color: C.textMuted }}>Your name appears at the top of the page.</p></div><span className="rounded-full px-2 py-1 text-[10px] font-bold" style={{ color: C.green, background: C.greenLight }}>Looks good</span></div>
                    <label className="mb-2 block text-xs font-semibold" htmlFor="resume-name">Full name</label>
                    <input id="resume-name" value={draft.name} onChange={e => updateDraft("name", e.target.value)} className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2" style={{ borderColor: C.border, background: "#faf8f4", color: C.text, outlineColor: C.greenBorder }} />
                  </div>

                  <div className="rounded-xl border p-5 shadow-[0_8px_30px_rgba(40,32,20,0.04)]" style={{ background: "#fffdf9", borderColor: C.border }}>
                    <div className="mb-4"><h3 className="font-semibold">Professional summary</h3><p className="mt-1 text-xs" style={{ color: C.textMuted }}>A short introduction tailored to this role.</p></div>
                    <textarea value={draft.summary} onChange={e => updateDraft("summary", e.target.value)} rows={Math.max(3, Math.ceil(draft.summary.length / 78) + 1)} className="w-full resize-y rounded-lg border px-3 py-2.5 text-sm leading-6 outline-none focus:ring-2" style={{ borderColor: C.border, background: "#faf8f4", color: C.text, outlineColor: C.greenBorder }} />
                    <p className="mt-2 text-[11px]" style={{ color: C.textFaint }}>Tip: Keep this to 2–4 sentences.</p>
                  </div>

                  <div className="rounded-xl border p-5 shadow-[0_8px_30px_rgba(40,32,20,0.04)]" style={{ background: "#fffdf9", borderColor: C.border }}>
                    <div className="mb-4"><h3 className="font-semibold">Resume sections</h3><p className="mt-1 text-xs" style={{ color: C.textMuted }}>Summary, education, experience, projects, and other sections from your resume.</p></div>
                    <div className="space-y-3">
                      {draft.sections.filter(section => section.name.toLowerCase() !== "summary").map(section => (
                        <div key={section.name} className="border-t pt-5 first:border-t-0 first:pt-0" style={{ borderColor: C.border }}>
                          <div className="mb-3 flex items-center justify-between"><h4 className="font-semibold">{section.name}</h4><span className="text-[11px]" style={{ color: C.textFaint }}>{section.entries.length || section.bullets.length || section.details.length} {section.entries.length === 1 ? "entry" : section.entries.length > 1 ? "entries" : section.details.length === 1 ? "row" : section.details.length > 1 ? "rows" : section.bullets.length === 1 ? "item" : "items"}</span></div>
                          <div className="space-y-3">
                            {section.detailType === "skills" && section.details.map(detail => <div key={detail.index} className="grid gap-2 sm:grid-cols-[minmax(150px,0.35fr)_1fr]"><label className="text-xs font-semibold">Category<input value={detail.label} readOnly className="mt-1 w-full rounded-md border px-2.5 py-2 text-sm font-normal" style={{ borderColor: C.border, background: "#f2eee8", color: C.textMuted }} /></label><label className="text-xs font-semibold">Skills / tools<textarea value={detail.value} onChange={e => updateSectionDetail(section.name, detail, e.target.value)} rows={Math.max(2, Math.ceil(detail.value.length / 78) + 1)} className="mt-1 w-full resize-y overflow-hidden rounded-md border px-2.5 py-2 text-sm font-normal leading-5 outline-none focus:ring-2" style={{ borderColor: C.border, background: "#faf8f4", color: C.text, outlineColor: C.greenBorder }} /></label></div>)}
                            {section.detailType === "certifications" && section.details.map(detail => <label key={detail.index} className="text-xs font-semibold">Certification list<textarea value={detail.value} onChange={e => updateSectionDetail(section.name, detail, e.target.value)} rows={Math.max(3, Math.ceil(detail.value.length / 78) + 1)} className="mt-1 w-full resize-y overflow-hidden rounded-md border px-2.5 py-2 text-sm font-normal leading-5 outline-none focus:ring-2" style={{ borderColor: C.border, background: "#faf8f4", color: C.text, outlineColor: C.greenBorder }} /></label>)}
                            {section.entries.map(entry => {
                              const isEducation = section.name.trim().toLowerCase() === "education";
                              const titleLabel = isEducation ? "School" : "Title";
                              const subtitleLabel = isEducation ? "Course / degree" : entry.command === "resumeProjectHeading" ? "Tools / stack" : "Role";
                              const metaLabel = isEducation ? "Location" : entry.command === "resumeProjectHeading" ? "Dates" : "Location · dates";
                              return <div key={entry.command + entry.occurrence} className="rounded-lg border p-4" style={{ background: "#faf8f4", borderColor: C.border }}>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <label className="text-xs font-semibold">{titleLabel}<input value={entry.title} onChange={e => updateEntry(section.name, entry, "title", e.target.value)} className="mt-1 w-full rounded-md border px-2.5 py-2 text-sm font-normal outline-none focus:ring-2" style={{ borderColor: C.border, background: "#fffdf9", color: C.text, outlineColor: C.greenBorder }} /></label>
                                  <label className="text-xs font-semibold">{subtitleLabel}<input value={entry.subtitle} onChange={e => updateEntry(section.name, entry, "subtitle", e.target.value)} className="mt-1 w-full rounded-md border px-2.5 py-2 text-sm font-normal outline-none focus:ring-2" style={{ borderColor: C.border, background: "#fffdf9", color: C.text, outlineColor: C.greenBorder }} /></label>
                                  <label className="text-xs font-semibold sm:col-span-2">{metaLabel}<input value={entry.meta} onChange={e => updateEntry(section.name, entry, "meta", e.target.value)} className="mt-1 w-full rounded-md border px-2.5 py-2 text-sm font-normal outline-none focus:ring-2" style={{ borderColor: C.border, background: "#fffdf9", color: C.text, outlineColor: C.greenBorder }} /></label>
                                  {isEducation && <label className="text-xs font-semibold sm:col-span-2">Description<textarea value={entry.description} onChange={e => updateEntry(section.name, entry, "description", e.target.value)} rows={Math.max(2, Math.ceil(entry.description.length / 78) + 1)} className="mt-1 w-full resize-y overflow-hidden rounded-md border px-2.5 py-2 text-sm font-normal leading-5 outline-none focus:ring-2" style={{ borderColor: C.border, background: "#fffdf9", color: C.text, outlineColor: C.greenBorder }} /></label>}
                                </div>
                                {entry.items.length > 0 && <div className="mt-4 space-y-3">
                                  {entry.items.map((bullet, itemIndex) => <div key={bullet.index} className="flex gap-2"><span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.greenBorder }} /><textarea aria-label={section.name + " description " + (itemIndex + 1)} value={bullet.text} onChange={e => updateBullet(bullet.index, e.target.value)} rows={Math.max(2, Math.ceil(bullet.text.length / 78) + 1)} className="w-full resize-y overflow-hidden rounded-lg border px-3 py-2 text-sm leading-5 outline-none focus:ring-2" style={{ borderColor: C.border, background: "#fffdf9", color: C.text, outlineColor: C.greenBorder }} /></div>)}
                                </div>}
                              </div>;
                            })}
                            {section.entries.length === 0 && section.bullets.map((bullet, itemIndex) => <div key={bullet.index} className="flex gap-2"><span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.greenBorder }} /><textarea aria-label={section.name + " description " + (itemIndex + 1)} value={bullet.text} onChange={e => updateBullet(bullet.index, e.target.value)} rows={Math.max(2, Math.ceil(bullet.text.length / 78) + 1)} className="w-full resize-y overflow-hidden rounded-lg border px-3 py-2 text-sm leading-5 outline-none focus:ring-2" style={{ borderColor: C.border, background: "#faf8f4", color: C.text, outlineColor: C.greenBorder }} /></div>)}
                            {section.entries.length === 0 && section.bullets.length === 0 && section.details.length === 0 && <p className="rounded-lg px-3 py-4 text-sm" style={{ background: "#f5f2ed", color: C.textMuted }}>This section has no editable descriptions yet. Its existing layout stays preserved.</p>}
                          </div>
                        </div>
                      ))}
                      {draft.sections.length === 0 && <p className="rounded-lg px-3 py-4 text-sm" style={{ background: "#f5f2ed", color: C.textMuted }}>No sections were detected in this resume.</p>}
                    </div>
                  </div>
                </div>
                {appState === "error" && <div className="mt-5 rounded-lg border px-4 py-3 text-sm" style={{ color: C.red, background: C.redBg, borderColor: "#ffcccc" }}>The preview could not be updated. {errorMsg}</div>}
              </div>
            </section>

            <section className="hidden min-h-[560px] w-full shrink-0 flex-col border-t lg:flex lg:min-h-0 lg:w-auto lg:flex-1 lg:border-l lg:border-t-0" style={{ background: "#e9e5de", borderColor: C.border }}>
              <div className="flex items-center justify-between border-b px-6 py-3" style={{ background: "#f3f0ea", borderColor: C.border }}>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: C.textMuted }}>Live preview</p>
                  <p className="mt-1 text-[11px]" style={{ color: C.textFaint }}>Update the preview when you’re ready</p>
                </div>
                <div className="flex items-center gap-2">
                  {numPages > 0 && (
                    <span
                      className="rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wider"
                      style={{
                        background: numPages === 1 ? C.greenLight : "#fffbeb",
                        color: numPages === 1 ? C.green : "#b45309",
                        borderColor: numPages === 1 ? C.greenBorder : "#fcd34d"
                      }}>
                      {numPages === 1 ? "1 Page" : `${numPages} Pages`}
                    </span>
                  )}
                  {atsResult && <span className="rounded-full border px-2 py-1 text-[10px] font-bold" style={{ background: atsResult.pass ? C.greenLight : C.redBg, color: atsResult.pass ? C.green : C.red, borderColor: atsResult.pass ? C.greenBorder : "#ffcccc" }}>{atsResult.pass ? "ATS friendly" : "Check suggestions"}</span>}
                </div>
              </div>

              <div className="flex flex-1 items-start justify-center overflow-auto p-4 sm:p-6">
                {isBusy && <div className="absolute mt-20 rounded-lg bg-white/80 px-4 py-3 text-xs shadow-sm" style={{ color: C.textMuted }}>Updating your preview…</div>}
                {pdfUrl && <div style={{ filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.18))" }}><Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess} loading={<div className="p-10 text-xs" style={{ color: C.textMuted }}>Loading preview…</div>} error={<div className="p-10 text-xs" style={{ color: C.red }}>Preview unavailable</div>}><Page pageNumber={currentPage} renderTextLayer={true} renderAnnotationLayer={false} width={Math.min(660, window.innerWidth < 1024 ? window.innerWidth - 64 : window.innerWidth * 0.43)} /></Document></div>}
              </div>
            </section>
          </div>
      </div>
    );
  }

  if (editorMode === "preview") {
    return (
      <div className="flex h-full flex-col" style={{ background: "#e9e5de", color: C.text }}>
          <EditorHeader
            eyebrow="Resume preview"
            title={jobLabel || "Tailored resume"}
            backHref={jobId ? "/tracker" : "/dashboard"}
            backLabel={jobId ? "← tracker" : "← dashboard"}
            jobId={jobId}
            copied={copied}
            onCopy={handleCopy}
            savingToJob={savingToJob}
            savedToJob={savedToJob}
            onSaveToJob={handleSaveToJob}
            coverLetterAvailable={Boolean(coverLetter.trim())}
            coverLetterBusy={coverLetterGenerating}
            onCoverLetter={handleCoverLetterAction}
            busy={isBusy}
            onRecompile={() => compileLatex()}
            hasPdf={!!pdfUrl}
            hasLatex={!!latex}
            downloadingDocx={downloadingDocx}
            onDownloadPdf={handleDownload}
            onDownloadDocx={handleDownloadDocx}
            onDownloadTex={handleDownloadTex}
            mode={editorMode}
            onModeChange={setEditorMode}
          />
          {coverLetterEditor}
          <div className="flex flex-1 items-start justify-center overflow-auto p-8">
            {isBusy && <div className="absolute mt-10 rounded-lg bg-white/80 px-4 py-3 text-xs shadow-sm" style={{ color: C.textMuted }}>Updating your preview…</div>}
            {pdfUrl && <div style={{ filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.18))" }}><Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess} loading={<div className="p-10 text-xs" style={{ color: C.textMuted }}>Loading preview…</div>} error={<div className="p-10 text-xs" style={{ color: C.red }}>Preview unavailable</div>}><Page pageNumber={currentPage} renderTextLayer={true} renderAnnotationLayer={false} width={Math.min(760, window.innerWidth - 120)} /></Document></div>}
          </div>
      </div>
    );
  }

  // ── Editor view ────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden font-mono"
        style={{ background: C.bg, color: C.text, userSelect: isDragging ? "none" : "auto" }}>

        <EditorHeader
          eyebrow="LaTeX source"
          title={jobLabel || "Tailored resume"}
          backHref={jobId ? "/tracker" : "/dashboard"}
          backLabel={jobId ? "← tracker" : "← dashboard"}
          jobId={jobId}
          copied={copied}
          onCopy={handleCopy}
          savingToJob={savingToJob}
          savedToJob={savedToJob}
          onSaveToJob={handleSaveToJob}
          coverLetterAvailable={Boolean(coverLetter.trim())}
          coverLetterBusy={coverLetterGenerating}
          onCoverLetter={handleCoverLetterAction}
          busy={isBusy}
          onRecompile={() => compileLatex()}
          hasPdf={!!pdfUrl}
          hasLatex={!!latex}
          downloadingDocx={downloadingDocx}
          onDownloadPdf={handleDownload}
          onDownloadDocx={handleDownloadDocx}
          onDownloadTex={handleDownloadTex}
          mode={editorMode}
          onModeChange={setEditorMode}
          extra={
            <>
              <button
                onClick={() => setAutoCompile(a => !a)}
                title="Toggle auto-compilation as you type (800ms debounce)"
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold tracking-[0.12em] uppercase rounded-sm transition-all"
                style={{
                  background: autoCompile ? C.greenLight : C.bgCard,
                  color: autoCompile ? C.green : C.textMuted,
                  border: `1px solid ${autoCompile ? C.greenBorder : C.border}`,
                }}>
                <span className={`w-2 h-2 rounded-full ${autoCompile ? 'bg-[#5a8a00] animate-pulse' : 'bg-gray-400'}`} />
                Auto-Compile {autoCompile ? "ON" : "OFF"}
              </button>
              <button
                onClick={() => setUseMonaco(m => !m)}
                title="Switch between Monaco IDE editor and plain text area"
                className="px-2.5 py-1.5 text-[11px] font-bold uppercase rounded-sm transition-all"
                style={{
                  background: useMonaco ? C.bgCard : C.bgSnippet,
                  color: C.textMid,
                  border: `1px solid ${C.border}`,
                }}>
                {useMonaco ? "Monaco IDE" : "Plain Text"}
              </button>
              {useMonaco && (
                <button
                  onClick={() => setEditorTheme(t => t === "vs-dark" ? "vs" : "vs-dark")}
                  title="Toggle Monaco Dark/Light theme"
                  className="px-2 py-1.5 text-[11px] rounded-sm border transition-all"
                  style={{ borderColor: C.border, color: C.textMid, background: C.bgCard }}>
                  {editorTheme === "vs-dark" ? "Dark" : "Light"}
                </button>
              )}
            </>
          }
        />
        {coverLetterEditor}

        {/* Compile status */}
        {(appState === "error" || appState === "editing" || numPages > 1) && (
          <div className="flex items-center gap-4 px-4 py-1.5 shrink-0 sm:px-7" style={{ background: C.bgCard, borderBottom: `1px solid ${C.border}` }}>
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
        )}

        {/* Icon Toolbar */}
        <div className="flex items-center gap-0.5 overflow-x-auto px-3 py-1.5 shrink-0" style={{ background: C.bgCard, borderBottom: `1px solid ${C.border}` }}>
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
        <div ref={containerRef} className="generate-source-panels flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row" style={{ cursor: isDragging ? "col-resize" : "auto" }}>

          {/* Left: Editor + Sections */}
          <div className="generate-source-left flex flex-col overflow-hidden" style={{ width: `${splitPct}%` }}>
            <div className="flex flex-1 overflow-hidden relative" style={{ background: useMonaco ? (editorTheme === "vs-dark" ? "#1e1e1e" : "#fff") : C.bgEditor }}>
              {useMonaco ? (
                <div className="w-full h-full relative">
                  <MonacoEditor
                    height="100%"
                    language="latex"
                    value={latex}
                    onChange={v => setLatex(v || "")}
                    theme={editorTheme}
                    options={{
                      fontSize: Math.round((zoom / 100) * 13),
                      fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Code', monospace",
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      lineNumbers: "on",
                      renderLineHighlight: "all",
                      padding: { top: 12, bottom: 12 },
                      tabSize: 2,
                      automaticLayout: true,
                      wordWrap: wordWrap ? "on" : "off",
                      quickSuggestions: true,
                    }}
                  />
                  {appState === "error" && errorMsg && (
                    <div className="absolute bottom-3 left-3 right-3 z-30 flex items-center justify-between px-3.5 py-2.5 text-xs rounded-md shadow-xl border backdrop-blur-md"
                         style={{ background: "rgba(255, 234, 234, 0.95)", borderColor: "#ffcccc", color: C.red }}>
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-bold">✗ Compilation Error:</span>
                        <span className="truncate">{errorMsg}</span>
                      </div>
                      <button onClick={() => compileLatex()} className="ml-3 shrink-0 px-2.5 py-1 text-[10px] font-bold rounded uppercase bg-white border border-red-300 hover:bg-red-50 text-red-700 shadow-sm">
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
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
                </>
              )}
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
            className="generate-source-divider flex items-center justify-center shrink-0 transition-colors"
            style={{ width: "5px", cursor: "col-resize", background: isDragging ? C.greenBorder : C.border, zIndex: 10 }}
            onMouseEnter={e => { if (!isDragging) e.currentTarget.style.background = C.borderStrong; }}
            onMouseLeave={e => { if (!isDragging) e.currentTarget.style.background = C.border; }}>
            <div className="flex flex-col gap-1">
              {[0,1,2].map(i => <div key={i} className="w-1 h-1 rounded-full" style={{ background: isDragging ? "#fff" : C.borderStrong }} />)}
            </div>
          </div>

          {/* Right: PDF Preview */}
          <div className="generate-source-preview flex min-h-0 flex-1 flex-col overflow-hidden">
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
                {clickedWord && <span className="text-[10px]" style={{ color: C.green }}>→ &quot;{clickedWord}&quot;</span>}
                {numPages > 0 && <span className="text-[10px]" style={{ color: C.textFaint }}>{numPages}p</span>}
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: appState === "editing" ? C.green : appState === "error" ? C.red : C.borderStrong }} />
                  <span className="text-[10px]" style={{ color: C.textMuted }}>tailored_resume.pdf</span>
                </div>
              </div>
            </div>

            <div className="relative flex-1 overflow-auto flex items-start justify-center py-8 px-6"
              style={{ background: "#e8e4dd" }} onDoubleClick={handlePdfDoubleClick}>
              {appState === "compiling" && !pdfUrl && (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <div className="flex gap-2">{[0,150,300].map(d => <span key={d} className="w-2 h-2 rounded-full animate-bounce" style={{ background: C.green, animationDelay: `${d}ms` }} />)}</div>
                  <p className="text-[10px] tracking-widest uppercase" style={{ color: C.textMuted }}>Compiling LaTeX...</p>
                </div>
              )}
              {pdfUrl && (
                <div style={{ filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.18))", cursor: "text", opacity: appState === "compiling" ? 0.72 : 1, transition: "opacity 150ms ease" }}>
                  <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess}
                    loading={<div className="flex items-center justify-center h-40 text-[10px] uppercase" style={{ color: C.textMuted }}>Loading...</div>}
                    error={<div className="flex items-center justify-center h-40 text-[11px]" style={{ color: C.red }}>Failed to render</div>}>
                    <Page pageNumber={currentPage} renderTextLayer={true} renderAnnotationLayer={false}
                      width={Math.min(700, window.innerWidth < 1024 ? window.innerWidth - 64 : (window.innerWidth * (1 - splitPct / 100)) - 60)} />
                  </Document>
                </div>
              )}
              {appState === "compiling" && pdfUrl && (
                <div className="pointer-events-none absolute right-4 top-4 z-20 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] shadow-sm"
                  style={{ background: "rgba(255,253,249,0.94)", borderColor: C.greenBorder, color: C.green }}>
                  Updating preview…
                </div>
              )}
              {!pdfUrl && appState === "error" && (
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
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={null}>
      <GeneratePageContent />
    </Suspense>
  );
}
