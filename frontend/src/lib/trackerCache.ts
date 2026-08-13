import type { JobSummary } from "@/lib/queries";

export function prependJob(jobs: JobSummary[] | undefined, job: JobSummary): JobSummary[] {
  return [job, ...(jobs || [])];
}

export function patchJob(jobs: JobSummary[] | undefined, id: number, patch: Partial<JobSummary>): JobSummary[] {
  return (jobs || []).map(job => job.id === id ? { ...job, ...patch } : job);
}

export function replaceJob(jobs: JobSummary[] | undefined, id: number, replacement: JobSummary): JobSummary[] {
  return (jobs || []).map(job => job.id === id ? replacement : job);
}

export function removeJob(jobs: JobSummary[] | undefined, id: number): JobSummary[] {
  return (jobs || []).filter(job => job.id !== id);
}
