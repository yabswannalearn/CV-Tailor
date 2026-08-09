"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/AppLayout";
import { JobMatchCard, ScrapedJobMatch } from "@/components/tracker/JobMatchCard";
import { API_URL, getApiError } from "@/lib/api";

const PAPER = {
  bg: "#f5f2ed",
  ink: "#1a1814",
  muted: "#a8a39c",
  sub: "#7a7570",
  border: "#d4cfc7",
  card: "#fffdf9",
  green: "#3d6600",
  greenBg: "#e8f5c0",
};

const SOURCES = [
  { id: "onlinejobs", name: "OnlineJobs.ph" },
  { id: "linkedin", name: "LinkedIn PH" },
  { id: "remoteok", name: "RemoteOK" },
  { id: "weworkremotely", name: "WeWorkRemotely" },
  { id: "remotive", name: "Remotive" },
  { id: "jobstreet", name: "JobStreet PH" },
  { id: "indeed-us", name: "Indeed (US)" },
  { id: "indeed-ph", name: "Indeed (PH)" },
];

const JOB_TYPES = ["Full-Time", "Part-Time", "Contract", "Gig"];

export default function DiscoverPage() {
  const router = useRouter();

  const [presets, setPresets] = useState<{ slug: string; display_name: string }[]>([]);
  const [keyword, setKeyword] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [selectedSources, setSelectedSources] = useState<string[]>(["onlinejobs", "linkedin", "remoteok", "weworkremotely"]);
  const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>([]);
  const [minScore, setMinScore] = useState<number>(0);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ScrapedJobMatch[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [sourceStatus, setSourceStatus] = useState<Record<string, string>>({});
  const [profileDefaults, setProfileDefaults] = useState<{ preset_slug?: string; skills?: string[] }>({});

  useEffect(() => {
    fetch(`${API_URL}/presets`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setPresets(Array.isArray(d) ? d : []))
      .catch(() => setPresets([]));
  }, []);

  const fetchJobs = useCallback(async (custom?: {
    kw?: string; preset?: string; srcs?: string[]; types?: string[]; score?: number;
  }) => {
    setIsLoading(true);
    setError(null);

    const activeKw = custom?.kw !== undefined ? custom.kw : keyword;
    const activePreset = custom?.preset !== undefined ? custom.preset : selectedPreset;
    const activeSrcs = custom?.srcs !== undefined ? custom.srcs : selectedSources;
    const activeTypes = custom?.types !== undefined ? custom.types : selectedJobTypes;
    const activeScore = custom?.score !== undefined ? custom.score : minScore;

    try {
      const qp = new URLSearchParams();
      if (activeKw.trim()) qp.set("keyword", activeKw.trim());
      if (activePreset) qp.set("preset_slug", activePreset);
      if (activeSrcs.length > 0) qp.set("sources", activeSrcs.join(","));
      if (activeTypes.length > 0) qp.set("job_types", activeTypes.join(","));
      if (activeScore > 0) qp.set("min_score", activeScore.toString());

      const res = await fetch(`/api/scraper/discover?${qp.toString()}`, {
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) throw new Error(await getApiError(res, "Failed to discover jobs. Please try again."));

      const data = await res.json();
      setJobs(data.jobs || []);
      setHasSearched(true);
      setSearchKeyword(data.search_keyword || activeKw);
      if (data.source_status) setSourceStatus(data.source_status);
      if (data.profile_defaults) {
        setProfileDefaults(data.profile_defaults);
        if (!selectedPreset && data.profile_defaults.preset_slug) setSelectedPreset(data.profile_defaults.preset_slug);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error discovering jobs");
    } finally {
      setIsLoading(false);
    }
  }, [keyword, selectedPreset, selectedSources, selectedJobTypes, minScore]);

  useEffect(() => {
    fetch(`${API_URL}/presets`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setPresets(Array.isArray(d) ? d : []))
      .catch(() => setPresets([]));
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => { e.preventDefault(); fetchJobs(); };

  const toggleSource = (s: string) =>
    setSelectedSources(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  const toggleJobType = (t: string) =>
    setSelectedJobTypes(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);

  const handleResetFilters = () => {
    const def = profileDefaults.preset_slug || "software-developer";
    setKeyword(""); setSelectedPreset(def);
    setSelectedSources(["onlinejobs", "remoteok", "weworkremotely"]);
    setSelectedJobTypes([]); setMinScore(0);
    fetchJobs({ kw: "", preset: def, srcs: ["onlinejobs", "remoteok", "weworkremotely"], types: [], score: 0 });
  };

  const handleImportJob = async (job: ScrapedJobMatch, redirectTailor: boolean) => {
    const res = await fetch("/api/scraper/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(job),
    });
    if (!res.ok) throw new Error("Failed to import job");
    const data = await res.json();
    if (redirectTailor && data.job_id) router.push(`/generate?job_id=${data.job_id}`);
  };

  return (
    <AppLayout>
      <div className="h-full overflow-auto font-mono" style={{ background: PAPER.bg, color: PAPER.ink }}>
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">

          {/* Header */}
          <div className="mb-8">
            <div className="text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: PAPER.green }}>cv_tailor</div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "'Georgia', serif" }}>Discover Remote Jobs</h1>
            <p className="text-xs mt-1" style={{ color: PAPER.muted }}>
              Find & score remote postings against your saved Profile, then import them to your tracker in one click.
            </p>
          </div>

          {/* Search + filter bar */}
          <section className="mb-6 rounded-xl border p-4 sm:p-5" style={{ borderColor: PAPER.border, background: PAPER.card }}>
            <form onSubmit={handleSearchSubmit} className="flex flex-wrap gap-2">
              <input
                type="text"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="Filter by keyword (e.g. React, Python, Customer Support)..."
                className="flex-1 min-w-[200px] text-sm p-2.5 rounded-sm outline-none transition-colors font-mono"
                style={{ border: `1px solid ${PAPER.border}`, background: "#fff" }}
              />
              <button
                type="button"
                onClick={() => setIsFilterOpen(o => !o)}
                className="px-4 py-2.5 rounded-sm text-xs font-bold tracking-[0.15em] uppercase transition-colors"
                style={{
                  border: `1px solid ${isFilterOpen ? PAPER.green : PAPER.border}`,
                  background: isFilterOpen ? PAPER.greenBg : "transparent",
                  color: isFilterOpen ? PAPER.green : PAPER.sub,
                }}
              >
                Filters{(selectedJobTypes.length > 0 || minScore > 0 || selectedSources.length < 4) ? " •" : ""}
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-5 py-2.5 rounded-sm text-xs font-bold tracking-[0.15em] uppercase text-white transition-colors disabled:opacity-50"
                style={{ background: PAPER.ink }}
                onMouseEnter={e => e.currentTarget.style.background = "#2a2520"}
                onMouseLeave={e => e.currentTarget.style.background = PAPER.ink}
              >
                {isLoading ? "Searching..." : "Search"}
              </button>
            </form>

            {isFilterOpen && (
              <div className="mt-4 pt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs" style={{ borderTop: `1px solid ${PAPER.border}` }}>
                {/* Role preset */}
                <div>
                  <label className="block text-[10px] tracking-[0.2em] uppercase mb-1.5" style={{ color: PAPER.sub }}>Target Role</label>
                  <select
                    value={selectedPreset}
                    onChange={e => setSelectedPreset(e.target.value)}
                    className="w-full text-sm p-2 rounded-sm outline-none font-mono"
                    style={{ border: `1px solid ${PAPER.border}`, background: "#fff" }}
                  >
                    <option value="">-- All Role Types --</option>
                    {presets.map(p => (
                      <option key={p.slug} value={p.slug}>{p.display_name}</option>
                    ))}
                  </select>
                </div>

                {/* Min score */}
                <div>
                  <label className="block text-[10px] tracking-[0.2em] uppercase mb-1.5" style={{ color: PAPER.sub }}>Min AI Fit Score</label>
                  <select
                    value={minScore}
                    onChange={e => setMinScore(Number(e.target.value))}
                    className="w-full text-sm p-2 rounded-sm outline-none font-mono"
                    style={{ border: `1px solid ${PAPER.border}`, background: "#fff" }}
                  >
                    <option value={0}>All Scores (0–100)</option>
                    <option value={60}>≥ 60% (Good)</option>
                    <option value={70}>≥ 70% (Strong)</option>
                    <option value={80}>≥ 80% (Exceptional)</option>
                  </select>
                </div>

                {/* Sources */}
                <div>
                  <label className="block text-[10px] tracking-[0.2em] uppercase mb-1.5" style={{ color: PAPER.sub }}>Websites to Search</label>
                  <div className="flex flex-wrap gap-1.5">
                    {SOURCES.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSource(s.id)}
                        className="px-2.5 py-1 rounded-sm border text-[11px] font-medium transition-colors"
                        style={
                          selectedSources.includes(s.id)
                            ? { background: PAPER.greenBg, color: PAPER.green, borderColor: "#8ab030" }
                            : { background: "#fff", color: PAPER.muted, borderColor: PAPER.border }
                        }
                      >
                        {selectedSources.includes(s.id) ? "✓ " : ""}{s.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Work type */}
                <div className="sm:col-span-2 md:col-span-3">
                  <label className="block text-[10px] tracking-[0.2em] uppercase mb-1.5" style={{ color: PAPER.sub }}>Work Type</label>
                  <div className="flex flex-wrap gap-2">
                    {JOB_TYPES.map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleJobType(t)}
                        className="px-3 py-1 rounded-sm border text-xs font-medium transition-colors"
                        style={
                          selectedJobTypes.includes(t)
                            ? { background: PAPER.greenBg, color: PAPER.green, borderColor: "#8ab030" }
                            : { background: "#fff", color: PAPER.sub, borderColor: PAPER.border }
                        }
                      >
                        {selectedJobTypes.includes(t) ? "✓ " : ""}{t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sm:col-span-2 md:col-span-3 flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${PAPER.border}` }}>
                  <button type="button" onClick={handleResetFilters} className="text-xs transition-colors" style={{ color: PAPER.sub }} onMouseEnter={e => e.currentTarget.style.color = PAPER.ink} onMouseLeave={e => e.currentTarget.style.color = PAPER.sub}>
                    ↺ Reset to Profile Defaults
                  </button>
                  <button type="button" onClick={() => fetchJobs()} className="px-4 py-1.5 rounded-sm text-xs font-bold tracking-[0.15em] uppercase text-white transition-colors" style={{ background: PAPER.ink }} onMouseEnter={e => e.currentTarget.style.background = "#2a2520"} onMouseLeave={e => e.currentTarget.style.background = PAPER.ink}>
                    Apply & Search
                  </button>
                </div>
              </div>
            )}

            {searchKeyword && (
              <div className="flex flex-col gap-2 text-xs mt-3" style={{ color: PAPER.sub }}>
                <div className="flex items-center justify-between">
                  <p>Showing matched remote positions for <span className="font-semibold" style={{ color: PAPER.ink }}>&quot;{searchKeyword}&quot;</span></p>
                  {jobs.length > 0 && <span>{jobs.length} jobs evaluated</span>}
                </div>
                {Object.keys(sourceStatus).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(sourceStatus).map(([src, st]) => {
                      const map: Record<string, { label: string; color: string; bg: string; border: string }> = {
                        ok: { label: "live", color: PAPER.green, bg: PAPER.greenBg, border: "#8ab030" },
                        no_results: { label: "no matches", color: PAPER.sub, bg: "#f0ede8", border: PAPER.border },
                        blocked: { label: "blocked", color: "#8a2a2a", bg: "#ffeaea", border: "#f8b8b8" },
                        error: { label: "error", color: "#8a2a2a", bg: "#ffeaea", border: "#f8b8b8" },
                      };
                      const s = map[st] || map.no_results;
                      return (
                        <span key={src} className="px-2 py-0.5 rounded-sm font-medium" style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
                          {src}: {s.label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Results */}
          {isLoading ? (
            <div className="py-20 text-center space-y-3">
              <div className="inline-block w-7 h-7 rounded-full" style={{ border: `3px solid ${PAPER.green}`, borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
              <p className="text-sm" style={{ color: PAPER.sub }}>Searching remote job boards & analyzing profile match...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl text-center text-sm" style={{ background: "#ffeaea", color: "#b83030", border: "1px solid #f8b8b8" }}>{error}</div>
          ) : !hasSearched ? (
            <div className="py-20 text-center text-sm" style={{ color: PAPER.muted }}>
              Enter a keyword or adjust your filters, then press <span className="font-semibold" style={{ color: PAPER.ink }}>Search</span> to find matching remote jobs.
            </div>
          ) : jobs.length === 0 ? (
            <div className="py-16 text-center text-sm" style={{ color: PAPER.muted }}>No matching jobs found. Try adjusting your filters above.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {jobs.map((job, idx) => (
                <JobMatchCard key={idx} job={job} onImport={handleImportJob} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
