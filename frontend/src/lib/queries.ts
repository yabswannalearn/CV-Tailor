import { useQuery } from "@tanstack/react-query";
import { API_URL, getApiError } from "@/lib/api";

export type CurrentUser = { user_id: number; email: string; credits: number };
export type ApplicationStatus = "Saved" | "Applied" | "Interview" | "Tech Test" | "Offer" | "Rejected" | "Ghosted";
export type ApplicationPriority = "High" | "Medium" | "Low";

export type JobSummary = {
  id: number;
  company_name: string;
  job_title: string;
  job_url?: string;
  short_description?: string;
  has_pdf: boolean;
  pdf_generated_at?: string;
  status: ApplicationStatus;
  date_applied?: string;
  follow_up_date?: string;
  job_type?: string;
  location?: string;
  salary_range?: string;
  priority: ApplicationPriority;
  template_id?: "classic" | "modern";
};

export type JobDetails = JobSummary & {
  job_description?: string;
  notes?: string;
  cover_letter?: string;
};

async function readJson<T>(path: string, fallback: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { credentials: "include" });
  if (!response.ok) throw new Error(await getApiError(response, fallback));
  return response.json() as Promise<T>;
}

export const queryKeys = {
  currentUser: ["current-user"] as const,
  trackerJobs: ["tracker", "jobs"] as const,
  trackerDetails: (id: number) => ["tracker", "details", id] as const,
};

export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: () => readJson<CurrentUser>("/auth/me", "Unable to load your account."),
    retry: false,
  });
}

export function useTrackerJobs(enabled = true) {
  return useQuery({
    queryKey: queryKeys.trackerJobs,
    queryFn: () => readJson<JobSummary[]>("/tracker/", "Unable to load your applications."),
    enabled,
  });
}

export function useTrackerDetails(id: number | null) {
  return useQuery({
    queryKey: id === null ? ["tracker", "details", "none"] : queryKeys.trackerDetails(id),
    queryFn: () => readJson<JobDetails>(`/tracker/${id}/details`, "Unable to load application details."),
    enabled: id !== null,
  });
}
