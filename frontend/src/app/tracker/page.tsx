"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import AppLayout from "@/components/AppLayout";

// Configure PDF.js worker - must be done on client only
if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

const API = "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────
type Status = "Saved" | "Applied" | "Interview" | "Tech Test" | "Offer" | "Rejected" | "Ghosted";
type Priority = "High" | "Medium" | "Low";

interface Job {
  id: number;
  company_name: string;
  job_title: string;
  job_url?: string;
  short_description?: string;
  job_description?: string;
  has_pdf: boolean;
  pdf_generated_at?: string;
  status: Status;
  date_applied?: string;
  follow_up_date?: string;
  job_type?: string;
  location?: string;
  salary_range?: string;
  priority: Priority;
  notes?: string;
  cover_letter?: string;
}

type JobForm = {
  company_name: string; job_title: string; job_url: string;
  short_description: string; job_description: string; status: Status;
  date_applied: string; follow_up_date: string; job_type: string;
  location: string; salary_range: string; priority: Priority; notes: string;
};

// ── Constants ────────────────────────────────────────────────────
const STATUSES: Status[] = ["Saved", "Applied", "Interview", "Tech Test", "Offer", "Rejected", "Ghosted"];

const SC: Record<Status, { bg: string; text: string; border: string; dot: string }> = {
  Saved:       { bg: "#f0ede8", text: "#4a4540", border: "#d4cfc7", dot: "#a8a39c" },
  Applied:     { bg: "#e8f0ff", text: "#2a4a8a", border: "#b8d0f8", dot: "#4a7acc" },
  Interview:   { bg: "#fff8e0", text: "#7a5a00", border: "#f0d880", dot: "#c8a800" },
  "Tech Test": { bg: "#f0e8ff", text: "#5a2a8a", border: "#d0b8f8", dot: "#8a4acc" },
  Offer:       { bg: "#e8f5c0", text: "#3d6600", border: "#8ab030", dot: "#5a8a00" },
  Rejected:    { bg: "#ffeaea", text: "#8a2a2a", border: "#f8b8b8", dot: "#cc3333" },
  Ghosted:     { bg: "#f0ede8", text: "#7a7570", border: "#d4cfc7", dot: "#b0aba4" },
};

const PC: Record<Priority, { text: string; bg: string }> = {
  High:   { text: "#b83030", bg: "#ffeaea" },
  Medium: { text: "#7a5a00", bg: "#fff8e0" },
  Low:    { text: "#4a4540", bg: "#f0ede8" },
};

const EMPTY: JobForm = {
  company_name: "", job_title: "", job_url: "", short_description: "",
  job_description: "", status: "Saved", date_applied: "", follow_up_date: "",
  job_type: "", location: "", salary_range: "", priority: "Medium", notes: "",
};

// ── UI helpers ───────────────────────────────────────────────────
function StatusBadge({ status }: { status: Status }) {
  const c = SC[status];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[10px] font-bold tracking-[0.08em] uppercase whitespace-nowrap"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.dot }} />{status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const c = PC[priority];
  const arrow = priority === "High" ? "↑" : priority === "Low" ? "↓" : "–";
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm text-[9px] font-bold tracking-[0.08em] uppercase"
      style={{ background: c.bg, color: c.text }}>
      {arrow} {priority}
    </span>
  );
}

function InputField({ label, value, onChange, type = "text", placeholder = "", required = false }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] tracking-[0.2em] uppercase mb-1.5" style={{ color: "#7a7570" }}>
        {label}{required && <span style={{ color: "#b83030" }}> *</span>}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full text-sm p-2.5 rounded-sm outline-none transition-colors font-mono"
        style={{ background: "#e8e4dd", color: "#1a1814", border: "1px solid #d4cfc7", caretColor: "#3d6600" }}
        onFocus={e => e.target.style.borderColor = "#8ab030"}
        onBlur={e => e.target.style.borderColor = "#d4cfc7"} />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div>
      <label className="block text-[10px] tracking-[0.2em] uppercase mb-1.5" style={{ color: "#7a7570" }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full text-sm p-2.5 rounded-sm outline-none appearance-none font-mono"
        style={{ background: "#e8e4dd", color: "#1a1814", border: "1px solid #d4cfc7" }}>
        {options.map(o => <option key={o} value={o}>{o || "— Select —"}</option>)}
      </select>
    </div>
  );
}

function IconBtn({ onClick, title, children, danger = false, green = false }: {
  onClick: () => void; title: string; children: React.ReactNode; danger?: boolean; green?: boolean;
}) {
  return (
    <button onClick={onClick} title={title}
      className="w-7 h-7 flex items-center justify-center rounded-sm transition-all shrink-0"
      style={{ color: "#a8a39c", background: "transparent" }}
      onMouseEnter={e => {
        e.currentTarget.style.color = danger ? "#b83030" : green ? "#3d6600" : "#1a1814";
        e.currentTarget.style.background = danger ? "#ffeaea" : green ? "#e8f5c0" : "#e8e4dd";
      }}
      onMouseLeave={e => { e.currentTarget.style.color = "#a8a39c"; e.currentTarget.style.background = "transparent"; }}>
      {children}
    </button>
  );
}

// ── PDF Preview Modal ────────────────────────────────────────────
function PdfModal({ jobId, companyName, onClose }: { jobId: number; companyName: string; onClose: () => void }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const pdfUrlRef = useRef<string | null>(null);
  const onLoad = useCallback(({ numPages }: { numPages: number }) => setNumPages(numPages), []);

  useEffect(() => {
    fetch(`${API}/tracker/${jobId}/pdf`, { credentials: "include" })
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        pdfUrlRef.current = url;
        setPdfUrl(url);
      });

    return () => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
    };
  }, [jobId]);
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-mono"
      style={{ background: "rgba(26,24,20,0.6)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex flex-col rounded-sm shadow-2xl overflow-hidden" style={{ width: "680px", maxHeight: "90vh", background: "#f5f2ed", border: "1px solid #d4cfc7" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ background: "#edeae4", borderBottom: "1px solid #d4cfc7" }}>
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full" style={{ background: "#5a8a00" }} />
            <span className="text-[11px] font-bold tracking-[0.1em] uppercase" style={{ color: "#1a1814" }}>
              {companyName} — Tailored Resume
            </span>
          </div>
          <div className="flex items-center gap-3">
            {numPages > 1 && (
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="text-[11px] disabled:opacity-20" style={{ color: "#7a7570" }}>←</button>
                <span className="text-[10px]" style={{ color: "#a8a39c" }}>{page}/{numPages}</span>
                <button onClick={() => setPage(p => Math.min(numPages, p + 1))} disabled={page >= numPages}
                  className="text-[11px] disabled:opacity-20" style={{ color: "#7a7570" }}>→</button>
              </div>
            )}
            <a href={`${API}/tracker/${jobId}/pdf`} target="_blank" rel="noopener noreferrer"
              className="text-[10px] px-3 py-1 rounded-sm font-bold tracking-[0.1em] uppercase transition-colors"
              style={{ background: "#1a1814", color: "#f5f2ed" }}>
              ↓ Download
            </a>
            <button onClick={onClose} className="text-lg leading-none transition-colors" style={{ color: "#a8a39c" }}
              onMouseEnter={e => e.currentTarget.style.color = "#1a1814"}
              onMouseLeave={e => e.currentTarget.style.color = "#a8a39c"}>✕</button>
          </div>
        </div>

        {/* PDF */}
        <div className="flex-1 overflow-auto flex items-start justify-center py-6 px-4" style={{ background: "#e8e4dd" }}>
          {!pdfUrl ? (
            <div className="flex items-center justify-center h-40 gap-2">
              {[0,150,300].map(d => <span key={d} className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#5a8a00", animationDelay: `${d}ms` }} />)}
            </div>
          ) : (
            <div style={{ filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.15))" }}>
              <Document file={pdfUrl} onLoadSuccess={onLoad}
                loading={<div className="flex items-center justify-center h-40 text-xs" style={{ color: "#a8a39c" }}>Loading...</div>}>
                <Page pageNumber={page} renderTextLayer={true} renderAnnotationLayer={true} width={620} />
              </Document>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Cover Letter Modal ───────────────────────────────────────────
function CoverLetterModal({ job, onClose, onSave }: { job: Job; onClose: () => void; onSave: (id: number, text: string) => void }) {
  const [text, setText] = useState(job.cover_letter || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(job.id, text);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-mono"
      style={{ background: "rgba(26,24,20,0.6)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex flex-col rounded-sm shadow-2xl overflow-hidden" style={{ width: "680px", maxHeight: "90vh", background: "#f5f2ed", border: "1px solid #d4cfc7" }}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ background: "#edeae4", borderBottom: "1px solid #d4cfc7" }}>
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full" style={{ background: "#5a8a00" }} />
            <span className="text-[11px] font-bold tracking-[0.1em] uppercase" style={{ color: "#1a1814" }}>
              {job.company_name} — Cover Letter
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="text-lg leading-none transition-colors" style={{ color: "#a8a39c" }}
              onMouseEnter={e => e.currentTarget.style.color = "#1a1814"}
              onMouseLeave={e => e.currentTarget.style.color = "#a8a39c"}>✕</button>
          </div>
        </div>

        {/* Text Area */}
        <div className="flex-1 overflow-auto flex flex-col p-4">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            className="w-full flex-1 p-4 text-sm rounded-sm outline-none resize-none font-mono"
            style={{ background: "#e8e4dd", color: "#1a1814", border: "1px solid #d4cfc7", minHeight: "400px" }}
            onFocus={e => e.target.style.borderColor = "#8ab030"}
            onBlur={e => e.target.style.borderColor = "#d4cfc7"}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 shrink-0" style={{ borderTop: "1px solid #d4cfc7" }}>
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold tracking-[0.1em] uppercase rounded-sm transition-colors" style={{ border: "1px solid #d4cfc7", color: "#7a7570" }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-xs font-bold tracking-[0.1em] uppercase rounded-sm transition-colors" style={{ background: "#1a1814", color: "#f5f2ed" }}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function TrackerPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ total: number; by_status: Record<string, number> }>({ total: 0, by_status: {} });
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [form, setForm] = useState<JobForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<Status | "All">("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedJob, setExpandedJob] = useState<number | null>(null);
  const [generatingFor, setGeneratingFor] = useState<number | null>(null);
  const [generatingClFor, setGeneratingClFor] = useState<number | null>(null);
  const [viewingPdfFor, setViewingPdfFor] = useState<Job | null>(null);
  const [viewingClFor, setViewingClFor] = useState<Job | null>(null);
  const [generateError, setGenerateError] = useState<{ id: number; msg: string } | null>(null);

  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: "include" })
      .then(res => { if (!res.ok) router.push("/login"); });
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [jobsRes, statsRes] = await Promise.all([
        fetch(`${API}/tracker/`, { credentials: "include" }),
        fetch(`${API}/tracker/stats`, { credentials: "include" }),
      ]);
      if (jobsRes.ok) setJobs(await jobsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } finally { setLoading(false); }
  };

  const openCreate = () => { setEditingJob(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (job: Job) => {
    setEditingJob(job);
    setForm({
      company_name: job.company_name, job_title: job.job_title,
      job_url: job.job_url || "", short_description: job.short_description || "",
      job_description: job.job_description || "", status: job.status,
      date_applied: job.date_applied || "", follow_up_date: job.follow_up_date || "",
      job_type: job.job_type || "", location: job.location || "",
      salary_range: job.salary_range || "", priority: job.priority, notes: job.notes || "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.company_name.trim() || !form.job_title.trim()) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        date_applied: form.date_applied || null,
        follow_up_date: form.follow_up_date || null,
        job_url: form.job_url || null,
        job_type: form.job_type || null,
        job_description: form.job_description || null,
      };
      const res = editingJob
        ? await fetch(`${API}/tracker/${editingJob.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) })
        : await fetch(`${API}/tracker/`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      if (res.ok) { setShowModal(false); await loadAll(); }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this job application?")) return;
    await fetch(`${API}/tracker/${id}`, { method: "DELETE", credentials: "include" });
    await loadAll();
  };

  const handleStatusChange = async (job: Job, newStatus: Status) => {
    await fetch(`${API}/tracker/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ status: newStatus }) });
    await loadAll();
  };

  const handleGeneratePdf = async (job: Job) => {
    if (!job.job_description?.trim()) {
      setGenerateError({ id: job.id, msg: "Add a job description first" });
      setTimeout(() => setGenerateError(null), 3000);
      return;
    }
    setGeneratingFor(job.id);
    setGenerateError(null);
    try {
      const res = await fetch(`${API}/tracker/${job.id}/generate-pdf`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        setGenerateError({ id: job.id, msg: err.detail || "Generation failed" });
        setTimeout(() => setGenerateError(null), 4000);
      } else {
        await loadAll();
      }
    } catch {
      setGenerateError({ id: job.id, msg: "Connection error" });
      setTimeout(() => setGenerateError(null), 3000);
    } finally { setGeneratingFor(null); }
  };

  const handleGenerateCoverLetter = async (job: Job) => {
    if (!job.job_description?.trim()) {
      setGenerateError({ id: job.id, msg: "Add a job description first" });
      setTimeout(() => setGenerateError(null), 3000);
      return;
    }
    setGeneratingClFor(job.id);
    setGenerateError(null);
    try {
      const res = await fetch(`${API}/tracker/${job.id}/generate-cover-letter`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        setGenerateError({ id: job.id, msg: err.detail || "Generation failed" });
        setTimeout(() => setGenerateError(null), 4000);
      } else {
        const data = await res.json();
        const updatedJob = { ...job, cover_letter: data.cover_letter };
        setJobs(jobs.map(j => j.id === job.id ? updatedJob : j));
        setViewingClFor(updatedJob);
      }
    } catch {
      setGenerateError({ id: job.id, msg: "Connection error" });
      setTimeout(() => setGenerateError(null), 3000);
    } finally { setGeneratingClFor(null); }
  };

  const handleSaveCoverLetter = async (id: number, text: string) => {
    try {
      const res = await fetch(`${API}/tracker/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cover_letter: text })
      });
      if (res.ok) {
        const data = await res.json();
        setJobs(jobs.map(j => j.id === id ? data : j));
      }
    } catch (e) {
      console.error("Failed to save cover letter", e);
    }
  };

  const setField = (k: keyof JobForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  const filtered = jobs.filter(j => {
    const matchStatus = filterStatus === "All" || j.status === filterStatus;
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || j.company_name.toLowerCase().includes(q) || j.job_title.toLowerCase().includes(q) || (j.location || "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  return (
    <AppLayout>
      <div className="h-full overflow-auto font-mono" style={{ background: "#f5f2ed", color: "#1a1814" }}>
        <div className="max-w-6xl mx-auto px-6 py-10">

          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: "#5a8a00" }}>cv_tailor</div>
              <h1 className="text-2xl font-bold" style={{ fontFamily: "'Georgia', serif" }}>Job Tracker</h1>
              <p className="text-xs mt-1" style={{ color: "#a8a39c" }}>
                {stats.total} application{stats.total !== 1 ? "s" : ""} · {jobs.filter(j => j.has_pdf).length} with generated CVs
              </p>
            </div>
            <button onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold tracking-[0.15em] uppercase rounded-sm transition-colors"
              style={{ background: "#1a1814", color: "#f5f2ed" }}
              onMouseEnter={e => e.currentTarget.style.background = "#2a2520"}
              onMouseLeave={e => e.currentTarget.style.background = "#1a1814"}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <line x1="5.5" y1="1" x2="5.5" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="1" y1="5.5" x2="10" y2="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Add Application
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-7 gap-2 mb-8">
            {STATUSES.map(s => {
              const c = SC[s];
              const count = stats.by_status[s] || 0;
              const active = filterStatus === s;
              return (
                <button key={s} onClick={() => setFilterStatus(active ? "All" : s)}
                  className="p-3 rounded-sm text-center transition-all"
                  style={{ background: active ? c.bg : "#edeae4", border: `1px solid ${active ? c.border : "#d4cfc7"}` }}>
                  <div className="text-xl font-bold" style={{ color: active ? c.text : "#1a1814", fontFamily: "'Georgia', serif" }}>{count}</div>
                  <div className="text-[9px] tracking-[0.08em] uppercase mt-0.5" style={{ color: active ? c.text : "#a8a39c" }}>{s}</div>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="flex items-center gap-3 mb-5">
            <div className="relative flex-1 max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="11" height="11" viewBox="0 0 11 11" fill="none">
                <circle cx="4.5" cy="4.5" r="3.5" stroke="#a8a39c" strokeWidth="1.2"/>
                <line x1="7.5" y1="7.5" x2="10" y2="10" stroke="#a8a39c" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search company, title, location..."
                className="w-full pl-8 pr-3 py-2 text-xs outline-none rounded-sm font-mono"
                style={{ background: "#edeae4", color: "#1a1814", border: "1px solid #d4cfc7" }} />
            </div>
            {filterStatus !== "All" && (
              <button onClick={() => setFilterStatus("All")}
                className="flex items-center gap-1.5 px-3 py-2 text-[10px] rounded-sm"
                style={{ background: "#edeae4", border: "1px solid #d4cfc7", color: "#7a7570" }}>
                ✕ Clear
              </button>
            )}
            <span className="text-[10px] ml-auto" style={{ color: "#a8a39c" }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
          </div>

          {/* List */}
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2">
              {[0,150,300].map(d => <span key={d} className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#3d6600", animationDelay: `${d}ms` }} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <rect x="4" y="4" width="28" height="28" rx="2" stroke="#d4cfc7" strokeWidth="1.5"/>
                <line x1="10" y1="12" x2="26" y2="12" stroke="#d4cfc7" strokeWidth="1.5"/>
                <line x1="10" y1="18" x2="22" y2="18" stroke="#d4cfc7" strokeWidth="1.5"/>
                <line x1="10" y1="24" x2="18" y2="24" stroke="#d4cfc7" strokeWidth="1.5"/>
              </svg>
              <p className="text-sm" style={{ color: "#a8a39c" }}>
                {searchQuery || filterStatus !== "All" ? "No jobs match your filter" : "No applications yet"}
              </p>
              {!searchQuery && filterStatus === "All" && (
                <button onClick={openCreate} className="text-xs px-4 py-2 rounded-sm"
                  style={{ background: "#e8f5c0", color: "#3d6600", border: "1px solid #8ab030" }}>
                  Add your first application →
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(job => {
                const expanded = expandedJob === job.id;
                const isGenerating = generatingFor === job.id;
                const err = generateError?.id === job.id ? generateError.msg : null;
                return (
                  <div key={job.id} className="rounded-sm" style={{ background: "#edeae4", border: "1px solid #d4cfc7" }}>

                    {/* Main row */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: SC[job.status].dot }} />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold" style={{ color: "#1a1814" }}>{job.company_name}</span>
                          <span className="text-[10px]" style={{ color: "#d4cfc7" }}>·</span>
                          <span className="text-sm" style={{ color: "#4a4540" }}>{job.job_title}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          {job.location && <span className="text-[10px]" style={{ color: "#a8a39c" }}>📍 {job.location}</span>}
                          {job.job_type && <span className="text-[10px]" style={{ color: "#a8a39c" }}>{job.job_type}</span>}
                          {job.salary_range && <span className="text-[10px]" style={{ color: "#a8a39c" }}>💰 {job.salary_range}</span>}
                          {job.date_applied && <span className="text-[10px]" style={{ color: "#a8a39c" }}>Applied {job.date_applied}</span>}
                          {job.has_pdf && job.pdf_generated_at && (
                            <span className="text-[10px]" style={{ color: "#5a8a00" }}>
                              ✓ CV generated {new Date(job.pdf_generated_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right controls */}
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        <PriorityBadge priority={job.priority} />
                        <StatusBadge status={job.status} />

                        {/* Quick status */}
                        <select value={job.status} onChange={e => handleStatusChange(job, e.target.value as Status)}
                          className="text-[10px] px-2 py-1 rounded-sm outline-none appearance-none cursor-pointer font-mono"
                          style={{ background: "#f5f2ed", color: "#7a7570", border: "1px solid #d4cfc7" }}
                          title="Change status">
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>

                        <div className="w-px h-5 shrink-0" style={{ background: "#d4cfc7" }} />

                        {/* Generate CV */}
                        <button
                          onClick={() => handleGeneratePdf(job)}
                          disabled={isGenerating}
                          title={job.job_description ? "Generate tailored CV for this job" : "Add job description first"}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] uppercase rounded-sm transition-all disabled:cursor-not-allowed"
                          style={{
                            background: isGenerating ? "#e8e4dd" : job.has_pdf ? "#e8f5c0" : "#f5f2ed",
                            color: isGenerating ? "#a8a39c" : job.has_pdf ? "#3d6600" : "#4a4540",
                            border: `1px solid ${isGenerating ? "#d4cfc7" : job.has_pdf ? "#8ab030" : "#d4cfc7"}`,
                          }}>
                          {isGenerating ? (
                            <span className="flex items-center gap-1">
                              <span className="inline-flex gap-0.5">
                                {[0,100,200].map(d => <span key={d} className="w-1 h-1 rounded-full animate-bounce" style={{ background: "#a8a39c", animationDelay: `${d}ms` }} />)}
                              </span>
                              Generating
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path d="M1.5 1H7L9 3V9H1.5V1Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                                <path d="M3 5.5h4M3 7h2.5" stroke="currentColor" strokeWidth="1"/>
                                <path d="M7 1v2h2" stroke="currentColor" strokeWidth="1"/>
                              </svg>
                              {job.has_pdf ? "Regenerate" : "Generate CV"}
                            </span>
                          )}
                        </button>

                        {/* View PDF */}
                        {job.has_pdf && (
                        <button
                            onClick={() => router.push(`/generate?job_id=${job.id}`)}
                            title="Open in editor"
                            className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] uppercase rounded-sm transition-all"
                            style={{ background: "#f5f2ed", color: "#4a4540", border: "1px solid #d4cfc7" }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#e8f5c0"; e.currentTarget.style.color = "#3d6600"; e.currentTarget.style.borderColor = "#8ab030"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "#f5f2ed"; e.currentTarget.style.color = "#4a4540"; e.currentTarget.style.borderColor = "#d4cfc7"; }}>
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M1.5 1H7L9 3V9H1.5V1Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                            <path d="M3 5.5h4M3 7h2.5" stroke="currentColor" strokeWidth="1"/>
                            </svg>
                            Open Editor
                        </button>
                        )}

                        <div className="w-px h-5 shrink-0" style={{ background: "#d4cfc7" }} />

                        {/* Generate Cover Letter */}
                        <button
                          onClick={() => handleGenerateCoverLetter(job)}
                          disabled={generatingClFor === job.id}
                          title={job.job_description ? "Generate cover letter for this job" : "Add job description first"}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] uppercase rounded-sm transition-all disabled:cursor-not-allowed"
                          style={{
                            background: generatingClFor === job.id ? "#e8e4dd" : job.cover_letter ? "#e8f5c0" : "#f5f2ed",
                            color: generatingClFor === job.id ? "#a8a39c" : job.cover_letter ? "#3d6600" : "#4a4540",
                            border: `1px solid ${generatingClFor === job.id ? "#d4cfc7" : job.cover_letter ? "#8ab030" : "#d4cfc7"}`,
                          }}>
                          {generatingClFor === job.id ? (
                            <span className="flex items-center gap-1">
                              <span className="inline-flex gap-0.5">
                                {[0,100,200].map(d => <span key={d} className="w-1 h-1 rounded-full animate-bounce" style={{ background: "#a8a39c", animationDelay: `${d}ms` }} />)}
                              </span>
                              Generating
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path d="M1 2v6h8V2H1zm1 1h6v1H2V3zm0 2h6v1H2V5zm0 2h4v1H2V7z" fill="currentColor"/>
                              </svg>
                              {job.cover_letter ? "Regenerate CL" : "Generate CL"}
                            </span>
                          )}
                        </button>

                        {/* View Cover Letter */}
                        {job.cover_letter && (
                          <button
                            onClick={() => setViewingClFor(job)}
                            title="View and Edit Cover Letter"
                            className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] uppercase rounded-sm transition-all"
                            style={{ background: "#f5f2ed", color: "#4a4540", border: "1px solid #d4cfc7" }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#e8f5c0"; e.currentTarget.style.color = "#3d6600"; e.currentTarget.style.borderColor = "#8ab030"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "#f5f2ed"; e.currentTarget.style.color = "#4a4540"; e.currentTarget.style.borderColor = "#d4cfc7"; }}>
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M1.5 1H7L9 3V9H1.5V1Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                              <path d="M3 5.5h4M3 7h2.5" stroke="currentColor" strokeWidth="1"/>
                            </svg>
                            Edit CL
                          </button>
                        )}

                        <div className="w-px h-5 shrink-0" style={{ background: "#d4cfc7" }} />

                        {/* Expand */}
                        <IconBtn onClick={() => setExpandedJob(expanded ? null : job.id)} title="Details">
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"
                            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>
                            <path d="M2 4L5.5 7L9 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </IconBtn>

                        {/* Edit */}
                        <IconBtn onClick={() => openEdit(job)} title="Edit" green>
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                            <path d="M7.5 1.5l2 2L3 10H1V8L7.5 1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                          </svg>
                        </IconBtn>

                        {/* Delete */}
                        <IconBtn onClick={() => handleDelete(job.id)} title="Delete" danger>
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                            <path d="M1.5 3h8M4 3V2h3v1M3.5 3v6h4V3h-4z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </IconBtn>
                      </div>
                    </div>

                    {/* Error toast */}
                    {err && (
                      <div className="px-4 pb-2">
                        <div className="px-3 py-2 text-[10px] rounded-sm" style={{ background: "#ffeaea", color: "#b83030", border: "1px solid #f8b8b8" }}>
                          ✗ {err}
                        </div>
                      </div>
                    )}

                    {/* Expanded */}
                    {expanded && (
                      <div className="px-4 pb-4 pt-2" style={{ borderTop: "1px solid #d4cfc7" }}>
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-3">
                            {job.short_description && (
                              <div>
                                <div className="text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: "#a8a39c" }}>Description</div>
                                <p className="text-xs leading-relaxed" style={{ color: "#4a4540" }}>{job.short_description}</p>
                              </div>
                            )}
                            {job.job_description && (
                              <div>
                                <div className="text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: "#a8a39c" }}>Job Description</div>
                                <p className="text-xs leading-relaxed line-clamp-4" style={{ color: "#7a7570" }}>{job.job_description}</p>
                              </div>
                            )}
                            {job.job_url && (
                              <div>
                                <div className="text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: "#a8a39c" }}>Job URL</div>
                                <a href={job.job_url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs underline truncate block" style={{ color: "#3d6600" }}>
                                  {job.job_url}
                                </a>
                              </div>
                            )}
                          </div>
                          <div className="space-y-3">
                            {job.follow_up_date && (
                              <div>
                                <div className="text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: "#a8a39c" }}>Follow-up Date</div>
                                <p className="text-xs" style={{ color: "#4a4540" }}>📅 {job.follow_up_date}</p>
                              </div>
                            )}
                            {job.notes && (
                              <div>
                                <div className="text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: "#a8a39c" }}>Notes</div>
                                <p className="text-xs leading-relaxed" style={{ color: "#4a4540" }}>{job.notes}</p>
                              </div>
                            )}
                            {job.has_pdf && (
                              <div>
                                <div className="text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: "#a8a39c" }}>CV Status</div>
                                <p className="text-xs" style={{ color: "#5a8a00" }}>
                                  ✓ Tailored CV saved · Generated {job.pdf_generated_at ? new Date(job.pdf_generated_at).toLocaleString() : ""}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Add/Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(26,24,20,0.5)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-sm shadow-2xl font-mono"
            style={{ background: "#f5f2ed", border: "1px solid #d4cfc7" }}>

            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #d4cfc7" }}>
              <h2 className="text-sm font-bold tracking-[0.1em] uppercase" style={{ color: "#1a1814" }}>
                {editingJob ? "Edit Application" : "New Application"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-lg leading-none" style={{ color: "#a8a39c" }}
                onMouseEnter={e => e.currentTarget.style.color = "#1a1814"}
                onMouseLeave={e => e.currentTarget.style.color = "#a8a39c"}>✕</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Company Name" value={form.company_name} onChange={v => setField("company_name", v)} placeholder="Google, Meta..." required />
                <InputField label="Job Title" value={form.job_title} onChange={v => setField("job_title", v)} placeholder="Software Engineer..." required />
              </div>
              <InputField label="Job URL" value={form.job_url} onChange={v => setField("job_url", v)} placeholder="https://linkedin.com/jobs/..." />
              <div>
                <label className="block text-[10px] tracking-[0.2em] uppercase mb-1.5" style={{ color: "#7a7570" }}>Short Description</label>
                <textarea value={form.short_description} onChange={e => setField("short_description", e.target.value)}
                  placeholder="Brief overview of the role..." rows={2}
                  className="w-full text-sm p-2.5 rounded-sm outline-none resize-none font-mono"
                  style={{ background: "#e8e4dd", color: "#1a1814", border: "1px solid #d4cfc7" }}
                  onFocus={e => e.target.style.borderColor = "#8ab030"}
                  onBlur={e => e.target.style.borderColor = "#d4cfc7"} />
              </div>

              {/* Job description — key field for AI */}
              <div>
                <label className="block text-[10px] tracking-[0.2em] uppercase mb-1.5" style={{ color: "#7a7570" }}>
                  Job Description
                  <span className="ml-2 normal-case tracking-normal" style={{ color: "#5a8a00" }}>— used by AI to generate your CV</span>
                </label>
                <textarea value={form.job_description} onChange={e => setField("job_description", e.target.value)}
                  placeholder="Paste the full job description here. The AI will use this to tailor your resume..." rows={5}
                  className="w-full text-sm p-2.5 rounded-sm outline-none resize-none font-mono"
                  style={{ background: "#e8e4dd", color: "#1a1814", border: "1px solid #d4cfc7" }}
                  onFocus={e => e.target.style.borderColor = "#8ab030"}
                  onBlur={e => e.target.style.borderColor = "#d4cfc7"} />
                <div className="text-[9px] mt-1" style={{ color: "#a8a39c" }}>{form.job_description.length} chars</div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <SelectField label="Status" value={form.status} onChange={v => setField("status", v)} options={STATUSES} />
                <SelectField label="Priority" value={form.priority} onChange={v => setField("priority", v)} options={["High", "Medium", "Low"]} />
                <SelectField label="Job Type" value={form.job_type} onChange={v => setField("job_type", v)} options={["", "Remote", "Hybrid", "On-site"]} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Location" value={form.location} onChange={v => setField("location", v)} placeholder="Manila / Remote..." />
                <InputField label="Salary Range" value={form.salary_range} onChange={v => setField("salary_range", v)} placeholder="₱50k–80k / $30–50/hr..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Date Applied" value={form.date_applied} onChange={v => setField("date_applied", v)} type="date" />
                <InputField label="Follow-up Date" value={form.follow_up_date} onChange={v => setField("follow_up_date", v)} type="date" />
              </div>
              <div>
                <label className="block text-[10px] tracking-[0.2em] uppercase mb-1.5" style={{ color: "#7a7570" }}>Notes</label>
                <textarea value={form.notes} onChange={e => setField("notes", e.target.value)}
                  placeholder="Referral from..., salary discussed, interviewer name..." rows={3}
                  className="w-full text-sm p-2.5 rounded-sm outline-none resize-none font-mono"
                  style={{ background: "#e8e4dd", color: "#1a1814", border: "1px solid #d4cfc7" }}
                  onFocus={e => e.target.style.borderColor = "#8ab030"}
                  onBlur={e => e.target.style.borderColor = "#d4cfc7"} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: "1px solid #d4cfc7" }}>
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs font-bold tracking-[0.1em] uppercase rounded-sm transition-colors"
                style={{ border: "1px solid #d4cfc7", color: "#7a7570" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#b8b3aa"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#d4cfc7"}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !form.company_name.trim() || !form.job_title.trim()}
                className="px-5 py-2 text-xs font-bold tracking-[0.1em] uppercase rounded-sm transition-colors disabled:cursor-not-allowed"
                style={{ background: saving || !form.company_name || !form.job_title ? "#d4cfc7" : "#1a1814", color: saving || !form.company_name || !form.job_title ? "#a8a39c" : "#f5f2ed" }}>
                {saving ? "Saving..." : editingJob ? "Save Changes" : "Add Application"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PDF Preview Modal ── */}
      {viewingPdfFor && (
        <PdfModal
          jobId={viewingPdfFor.id}
          companyName={viewingPdfFor.company_name}
          onClose={() => setViewingPdfFor(null)}
        />
      )}

      {/* ── Cover Letter Modal ── */}
      {viewingClFor && (
        <CoverLetterModal
          job={viewingClFor}
          onClose={() => setViewingClFor(null)}
          onSave={handleSaveCoverLetter}
        />
      )}
    </AppLayout>
  );
}