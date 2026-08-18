import React, { useState } from 'react';
import { JobMatchScoreBadge } from './JobMatchScoreBadge';

const C = {
  ink: "#1a1814",
  sub: "#7a7570",
  muted: "#a8a39c",
  border: "#d4cfc7",
  card: "#fffdf9",
  green: "#3d6600",
  greenBg: "#e8f5c0",
  emerald: "#3d6600",
};

export interface ScrapedJobMatch {
  company_name: string;
  job_title: string;
  job_url: string;
  location: string;
  salary_range: string;
  job_description: string;
  short_description: string;
  job_type: string;
  source?: string;
  match_score?: number;
  match_analysis?: {
    summary: string;
    pros: string[];
    cons: string[];
  };
}

interface JobMatchCardProps {
  job: ScrapedJobMatch;
  onImport: (job: ScrapedJobMatch, redirectTailor: boolean) => Promise<void>;
}

export const JobMatchCard: React.FC<JobMatchCardProps> = ({ job, onImport }) => {
  const [isImporting, setIsImporting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAction = async (redirectTailor: boolean) => {
    setIsImporting(true);
    try {
      await onImport(job, redirectTailor);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="rounded-xl p-5 transition-all flex flex-col justify-between gap-4 font-mono" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      {/* Header Info */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-lg line-clamp-1" style={{ color: C.ink }}>{job.job_title}</h3>
            <p className="text-sm font-medium" style={{ color: C.sub }}>{job.company_name}</p>
          </div>
          {typeof job.match_score === "number" && (
            <JobMatchScoreBadge score={job.match_score} size="md" />
          )}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: C.sub }}>
          {job.source && (
            <span className="px-2.5 py-1 rounded-md font-semibold" style={{ background: C.greenBg, color: C.green, border: "1px solid #8ab030" }}>
              🌐 {job.source}
            </span>
          )}
          <span className="px-2.5 py-1 rounded-md" style={{ background: "#f0ede8", border: `1px solid ${C.border}` }}>
            📍 {job.location || 'Remote'}
          </span>
          <span className="px-2.5 py-1 rounded-md" style={{ background: "#f0ede8", border: `1px solid ${C.border}` }}>
            💰 {job.salary_range || 'Competitive'}
          </span>
          <span className="px-2.5 py-1 rounded-md" style={{ background: "#f0ede8", border: `1px solid ${C.border}` }}>
            💼 {job.job_type || 'Full-Time'}
          </span>
        </div>

        {/* AI Fit Analysis */}
        {job.match_analysis && (
          <div className="rounded-lg p-3 space-y-2 text-xs" style={{ background: "#f0ede8", border: `1px solid ${C.border}` }}>
            <p className="font-medium leading-relaxed" style={{ color: C.ink }}>
              <span className="font-semibold" style={{ color: C.green }}>AI Fit: </span>
              {job.match_analysis.summary}
            </p>

            {job.match_analysis.pros && job.match_analysis.pros.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {job.match_analysis.pros.map((pro, idx) => (
                  <span key={idx} className="px-2 py-0.5 rounded text-[11px]" style={{ background: C.greenBg, color: C.green, border: "1px solid #8ab030" }}>
                    ✓ {pro}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Short Description */}
        <p className="text-xs line-clamp-3 leading-relaxed" style={{ color: C.sub }}>
          {job.short_description || job.job_description}
        </p>

        {isExpanded && (
          <div className="mt-2 text-xs p-3 rounded whitespace-pre-wrap max-h-48 overflow-y-auto" style={{ color: C.ink, background: "#f5f2ed", border: `1px solid ${C.border}` }}>
            {job.job_description}
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="pt-3 flex items-center justify-between gap-2" style={{ borderTop: `1px solid ${C.border}` }}>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs font-medium transition-colors"
          style={{ color: C.green }}
          onMouseEnter={e => e.currentTarget.style.color = C.ink}
          onMouseLeave={e => e.currentTarget.style.color = C.green}
        >
          {isExpanded ? 'Hide Details' : 'View Full Details'}
        </button>

        <div className="flex items-center gap-2">
          {job.job_url && (
            <a
              href={job.job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs rounded-lg font-medium transition-colors"
              style={{ background: "#f0ede8", color: C.sub, border: `1px solid ${C.border}` }}
              onMouseEnter={e => e.currentTarget.style.color = C.ink}
              onMouseLeave={e => e.currentTarget.style.color = C.sub}
            >
              Link ↗
            </a>
          )}
          <button
            type="button"
            disabled={isImporting}
            onClick={() => handleAction(false)}
            className="px-3 py-1.5 text-xs rounded-lg font-medium transition-colors disabled:opacity-50"
            style={{ background: "#f0ede8", color: C.ink, border: `1px solid ${C.border}` }}
            onMouseEnter={e => e.currentTarget.style.background = "#e6e2db"}
            onMouseLeave={e => e.currentTarget.style.background = "#f0ede8"}
          >
            {isImporting ? 'Saving...' : 'Save to Tracker'}
          </button>
          <button
            type="button"
            disabled={isImporting}
            onClick={() => handleAction(true)}
            className="px-3 py-1.5 text-xs text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            style={{ background: C.ink }}
            onMouseEnter={e => e.currentTarget.style.background = "#2a2520"}
            onMouseLeave={e => e.currentTarget.style.background = C.ink}
          >
            Save & Tailor
          </button>
        </div>
      </div>
    </div>
  );
};
