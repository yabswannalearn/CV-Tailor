"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/AppLayout";

const API = "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────
type Status = "Saved" | "Applied" | "Interview" | "Tech Test" | "Offer" | "Rejected" | "Ghosted";
type Priority = "High" | "Medium" | "Low";
type JobType = "Remote" | "Hybrid" | "On-site" | "";

interface Job {
  id: number;
  company_name: string;
  job_title: string;
  job_url?: string;
  short_description?: string;
  status: Status;
  date_applied?: string;
  follow_up_date?: string;
  job_type?: JobType;
  location?: string;
  salary_range?: string;
  priority: Priority;
  notes?: string;
}

type JobForm = Omit<Job, "id">;

// ── Constants ────────────────────────────────────────────────────
const STATUSES: Status[] = ["Saved", "Applied", "Interview", "Tech Test", "Offer", "Rejected", "Ghosted"];

const STATUS_COLORS: Record<Status, { bg: string; text: string; border: string; dot: string }> = {
  Saved:      { bg: "#f0ede8", text: "#4a4540", border: "#d4cfc7", dot: "#a8a39c" },
  Applied:    { bg: "#e8f0ff", text: "#2a4a8a", border: "#b8d0f8", dot: "#4a7acc" },
  Interview:  { bg: "#fff8e0", text: "#7a5a00", border: "#f0d880", dot: "#c8a800" },
  "Tech Test":{ bg: "#f0e8ff", text: "#5a2a8a", border: "#d0b8f8", dot: "#8a4acc" },
  Offer:      { bg: "#e8f5c0", text: "#3d6600", border: "#8ab030", dot: "#5a8a00" },
  Rejected:   { bg: "#ffeaea", text: "#8a2a2a", border: "#f8b8b8", dot: "#cc3333" },
  Ghosted:    { bg: "#f0ede8", text: "#7a7570", border: "#d4cfc7", dot: "#b0aba4" },
};

const PRIORITY_COLORS: Record<Priority, { text: string; bg: string }> = {
  High:   { text: "#b83030", bg: "#ffeaea" },
  Medium: { text: "#7a5a00", bg: "#fff8e0" },
  Low:    { text: "#4a4540", bg: "#f0ede8" },
};

const EMPTY_FORM: JobForm = {
  company_name: "", job_title: "", job_url: "", short_description: "",
  status: "Saved", date_applied: "", follow_up_date: "",
  job_type: "", location: "", salary_range: "", priority: "Medium", notes: "",
};

// ── Sub-components ───────────────────────────────────────────────
function StatusBadge({ status }: { status: Status }) {
  const c = STATUS_COLORS[status];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[10px] font-bold tracking-[0.1em] uppercase"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.dot }} />
      {status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const c = PRIORITY_COLORS[priority];
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-bold tracking-[0.1em] uppercase"
      style={{ background: c.bg, color: c.text }}>
      {priority === "High" && "↑"}{priority === "Low" && "↓"}{priority === "Medium" && "–"} {priority}
    </span>
  );
}

function InputField({ label, value, onChange, type = "text", placeholder = "" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] tracking-[0.2em] uppercase mb-1.5" style={{ color: "#7a7570" }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full text-sm p-2.5 rounded-sm outline-none transition-colors"
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
        className="w-full text-sm p-2.5 rounded-sm outline-none appearance-none"
        style={{ background: "#e8e4dd", color: "#1a1814", border: "1px solid #d4cfc7" }}>
        {options.map(o => <option key={o} value={o}>{o || "— Select —"}</option>)}
      </select>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────
export default function TrackerPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ total: number; by_status: Record<string, number> }>({ total: 0, by_status: {} });
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [form, setForm] = useState<JobForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<Status | "All">("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedJob, setExpandedJob] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: "include" })
      .then(res => { if (!res.ok) router.push("/login"); })
      .catch(() => router.push("/login"));
    loadJobs();
    loadStats();
  }, []);

  const loadJobs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/tracker/`, { credentials: "include" });
      if (res.ok) setJobs(await res.json());
    } finally { setLoading(false); }
  };

  const loadStats = async () => {
    const res = await fetch(`${API}/tracker/stats`, { credentials: "include" });
    if (res.ok) setStats(await res.json());
  };

  const openCreate = () => { setEditingJob(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (job: Job) => {
    setEditingJob(job);
    setForm({ company_name: job.company_name, job_title: job.job_title, job_url: job.job_url || "", short_description: job.short_description || "", status: job.status, date_applied: job.date_applied || "", follow_up_date: job.follow_up_date || "", job_type: job.job_type || "", location: job.location || "", salary_range: job.salary_range || "", priority: job.priority, notes: job.notes || "" });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.company_name.trim() || !form.job_title.trim()) return;
    setSaving(true);
    try {
      const body = { ...form, date_applied: form.date_applied || null, follow_up_date: form.follow_up_date || null, job_url: form.job_url || null, job_type: form.job_type || null };
      const res = editingJob
        ? await fetch(`${API}/tracker/${editingJob.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) })
        : await fetch(`${API}/tracker/`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      if (res.ok) { setShowModal(false); await loadJobs(); await loadStats(); }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this job application?")) return;
    await fetch(`${API}/tracker/${id}`, { method: "DELETE", credentials: "include" });
    await loadJobs(); await loadStats();
  };

  const handleStatusChange = async (job: Job, newStatus: Status) => {
    await fetch(`${API}/tracker/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ status: newStatus }) });
    await loadJobs(); await loadStats();
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
              <p className="text-xs mt-1" style={{ color: "#a8a39c" }}>{stats.total} application{stats.total !== 1 ? "s" : ""} tracked</p>
            </div>
            <button onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold tracking-[0.15em] uppercase rounded-sm transition-colors"
              style={{ background: "#1a1814", color: "#f5f2ed" }}
              onMouseEnter={e => e.currentTarget.style.background = "#2a2520"}
              onMouseLeave={e => e.currentTarget.style.background = "#1a1814"}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Add Application
            </button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-7 gap-2 mb-8">
            {STATUSES.map(s => {
              const c = STATUS_COLORS[s];
              const count = stats.by_status[s] || 0;
              return (
                <button key={s} onClick={() => setFilterStatus(filterStatus === s ? "All" : s)}
                  className="p-3 rounded-sm text-center transition-all"
                  style={{ background: filterStatus === s ? c.bg : "#edeae4", border: `1px solid ${filterStatus === s ? c.border : "#d4cfc7"}` }}>
                  <div className="text-xl font-bold" style={{ color: filterStatus === s ? c.text : "#1a1814" }}>{count}</div>
                  <div className="text-[9px] tracking-[0.1em] uppercase mt-0.5" style={{ color: filterStatus === s ? c.text : "#a8a39c" }}>{s}</div>
                </button>
              );
            })}
          </div>

          {/* Search + filter bar */}
          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1 max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="5" cy="5" r="3.5" stroke="#a8a39c" strokeWidth="1.2"/>
                <line x1="8" y1="8" x2="11" y2="11" stroke="#a8a39c" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search company, title, location..."
                className="w-full pl-8 pr-3 py-2 text-xs outline-none rounded-sm"
                style={{ background: "#edeae4", color: "#1a1814", border: "1px solid #d4cfc7" }} />
            </div>
            {filterStatus !== "All" && (
              <button onClick={() => setFilterStatus("All")}
                className="flex items-center gap-1.5 px-3 py-2 text-[10px] rounded-sm transition-colors"
                style={{ background: "#edeae4", border: "1px solid #d4cfc7", color: "#7a7570" }}>
                ✕ Clear filter
              </button>
            )}
            <span className="text-[10px] ml-auto" style={{ color: "#a8a39c" }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Job list */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex gap-2">{[0,150,300].map(d => <span key={d} className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#3d6600", animationDelay: `${d}ms` }} />)}</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect x="6" y="6" width="28" height="32" rx="2" stroke="#d4cfc7" strokeWidth="1.5"/>
                <line x1="12" y1="14" x2="28" y2="14" stroke="#d4cfc7" strokeWidth="1.5"/>
                <line x1="12" y1="20" x2="24" y2="20" stroke="#d4cfc7" strokeWidth="1.5"/>
                <line x1="12" y1="26" x2="20" y2="26" stroke="#d4cfc7" strokeWidth="1.5"/>
              </svg>
              <p className="text-sm" style={{ color: "#a8a39c" }}>
                {searchQuery || filterStatus !== "All" ? "No jobs match your filter" : "No applications yet"}
              </p>
              {!searchQuery && filterStatus === "All" && (
                <button onClick={openCreate} className="text-xs px-4 py-2 rounded-sm" style={{ background: "#e8f5c0", color: "#3d6600", border: "1px solid #8ab030" }}>
                  Add your first application →
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(job => {
                const expanded = expandedJob === job.id;
                const sc = STATUS_COLORS[job.status];
                return (
                  <div key={job.id} className="rounded-sm transition-all" style={{ background: "#edeae4", border: `1px solid ${expanded ? "#d4cfc7" : "#d4cfc7"}` }}>

                    {/* Main row */}
                    <div className="flex items-center gap-4 px-4 py-3">

                      {/* Status dot + company */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: sc.dot }} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold truncate" style={{ color: "#1a1814" }}>{job.company_name}</span>
                            <span className="text-[10px]" style={{ color: "#a8a39c" }}>·</span>
                            <span className="text-sm truncate" style={{ color: "#4a4540" }}>{job.job_title}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {job.location && <span className="text-[10px]" style={{ color: "#a8a39c" }}>📍 {job.location}</span>}
                            {job.job_type && <span className="text-[10px]" style={{ color: "#a8a39c" }}>{job.job_type}</span>}
                            {job.salary_range && <span className="text-[10px]" style={{ color: "#a8a39c" }}>💰 {job.salary_range}</span>}
                            {job.date_applied && <span className="text-[10px]" style={{ color: "#a8a39c" }}>Applied {job.date_applied}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Right side */}
                      <div className="flex items-center gap-3 shrink-0">
                        <PriorityBadge priority={job.priority} />
                        <StatusBadge status={job.status} />

                        {/* Quick status change */}
                        <select value={job.status}
                          onChange={e => handleStatusChange(job, e.target.value as Status)}
                          className="text-[10px] px-2 py-1 rounded-sm outline-none appearance-none cursor-pointer"
                          style={{ background: "#f5f2ed", color: "#7a7570", border: "1px solid #d4cfc7" }}
                          title="Change status">
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>

                        {/* Expand */}
                        <button onClick={() => setExpandedJob(expanded ? null : job.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-sm transition-colors"
                          style={{ color: "#a8a39c", background: "transparent" }}
                          onMouseEnter={e => e.currentTarget.style.background = "#d4cfc7"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>
                            <path d="M2.5 4.5L6 7.5L9.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>

                        {/* Edit */}
                        <button onClick={() => openEdit(job)}
                          className="w-7 h-7 flex items-center justify-center rounded-sm transition-colors"
                          style={{ color: "#a8a39c" }}
                          onMouseEnter={e => { e.currentTarget.style.color = "#3d6600"; e.currentTarget.style.background = "#e8f5c0"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = "#a8a39c"; e.currentTarget.style.background = "transparent"; }}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M8 2l2 2-6 6H2V8l6-6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                          </svg>
                        </button>

                        {/* Delete */}
                        <button onClick={() => handleDelete(job.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-sm transition-colors"
                          style={{ color: "#a8a39c" }}
                          onMouseEnter={e => { e.currentTarget.style.color = "#b83030"; e.currentTarget.style.background = "#ffeaea"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = "#a8a39c"; e.currentTarget.style.background = "transparent"; }}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 3h8M5 3V2h2v1M4 3v6h4V3H4z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {expanded && (
                      <div className="px-4 pb-4 pt-1" style={{ borderTop: "1px solid #d4cfc7" }}>
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-3">
                            {job.short_description && (
                              <div>
                                <div className="text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: "#a8a39c" }}>Description</div>
                                <p className="text-xs leading-relaxed" style={{ color: "#4a4540" }}>{job.short_description}</p>
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

      {/* ── Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(26,24,20,0.5)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-sm shadow-2xl font-mono"
            style={{ background: "#f5f2ed", border: "1px solid #d4cfc7" }}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #d4cfc7" }}>
              <h2 className="text-sm font-bold tracking-[0.1em] uppercase" style={{ color: "#1a1814" }}>
                {editingJob ? "Edit Application" : "New Application"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-lg leading-none transition-colors" style={{ color: "#a8a39c" }}
                onMouseEnter={e => e.currentTarget.style.color = "#1a1814"}
                onMouseLeave={e => e.currentTarget.style.color = "#a8a39c"}>✕</button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">

              {/* Row 1 */}
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Company Name *" value={form.company_name} onChange={v => setField("company_name", v)} placeholder="Google, Meta, Startup..." />
                <InputField label="Job Title *" value={form.job_title} onChange={v => setField("job_title", v)} placeholder="Software Engineer..." />
              </div>

              {/* Row 2 */}
              <InputField label="Job URL" value={form.job_url || ""} onChange={v => setField("job_url", v)} placeholder="https://linkedin.com/jobs/..." />

              {/* Row 3 */}
              <div>
                <label className="block text-[10px] tracking-[0.2em] uppercase mb-1.5" style={{ color: "#7a7570" }}>Short Description</label>
                <textarea value={form.short_description || ""} onChange={e => setField("short_description", e.target.value)}
                  placeholder="Brief overview of the role..."
                  rows={2}
                  className="w-full text-sm p-2.5 rounded-sm outline-none resize-none transition-colors"
                  style={{ background: "#e8e4dd", color: "#1a1814", border: "1px solid #d4cfc7" }}
                  onFocus={e => e.target.style.borderColor = "#8ab030"}
                  onBlur={e => e.target.style.borderColor = "#d4cfc7"} />
              </div>

              {/* Row 4 */}
              <div className="grid grid-cols-3 gap-4">
                <SelectField label="Status" value={form.status} onChange={v => setField("status", v)} options={STATUSES} />
                <SelectField label="Priority" value={form.priority} onChange={v => setField("priority", v)} options={["High", "Medium", "Low"]} />
                <SelectField label="Job Type" value={form.job_type || ""} onChange={v => setField("job_type", v)} options={["", "Remote", "Hybrid", "On-site"]} />
              </div>

              {/* Row 5 */}
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Location" value={form.location || ""} onChange={v => setField("location", v)} placeholder="Manila, PH / Remote..." />
                <InputField label="Salary Range" value={form.salary_range || ""} onChange={v => setField("salary_range", v)} placeholder="₱50k-80k / $30-50/hr..." />
              </div>

              {/* Row 6 */}
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Date Applied" value={form.date_applied || ""} onChange={v => setField("date_applied", v)} type="date" />
                <InputField label="Follow-up Date" value={form.follow_up_date || ""} onChange={v => setField("follow_up_date", v)} type="date" />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] tracking-[0.2em] uppercase mb-1.5" style={{ color: "#7a7570" }}>Notes</label>
                <textarea value={form.notes || ""} onChange={e => setField("notes", e.target.value)}
                  placeholder="Referral from..., asked about salary, interviewer name..."
                  rows={3}
                  className="w-full text-sm p-2.5 rounded-sm outline-none resize-none"
                  style={{ background: "#e8e4dd", color: "#1a1814", border: "1px solid #d4cfc7" }}
                  onFocus={e => e.target.style.borderColor = "#8ab030"}
                  onBlur={e => e.target.style.borderColor = "#d4cfc7"} />
              </div>
            </div>

            {/* Modal footer */}
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
    </AppLayout>
  );
}