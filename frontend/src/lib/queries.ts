import { queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";
import { API_URL, getApiError } from "@/lib/api";

export type CurrentUser = { user_id: number; email: string; credits: number; is_admin: boolean };

export type AdminUser = {
  id: number;
  email: string;
  name: string;
  credits: number;
  is_admin: boolean;
  tracker: { total: number; by_status: Partial<Record<ApplicationStatus, number>> };
};
export type ApplicationStatus = "Saved" | "Applied" | "Interview" | "Tech Test" | "Offer" | "Rejected" | "Ghosted";
export type ApplicationPriority = "High" | "Medium" | "Low";
export type ResumeTemplate = "classic" | "modern";

export type Education = { school_name: string; course: string; location: string; description?: string };
export type Experience = { job_title: string; company: string; location: string; description?: string; date_range?: string };
export type Project = { name: string; description?: string; date_range?: string };
export type Certification = { name: string; issuer?: string; date_issued?: string };
export type Profile = {
  first_name: string;
  last_name: string;
  mobile_no: string;
  email: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  education: Education[];
  experience: Experience[];
  projects: Project[];
  skills: { skill_name: string }[];
  certifications: Certification[];
  preset_slug?: string;
};

export type PresetSummary = {
  slug: string;
  display_name: string;
  recommended_template?: ResumeTemplate;
};

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
  template_id?: ResumeTemplate;
};

export type JobDetails = JobSummary & {
  job_description?: string;
  notes?: string;
  cover_letter?: string;
};

export type TrackerStats = { total: number; by_status: Partial<Record<ApplicationStatus, number>> };

export class ApiQueryError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiQueryError";
  }
}

export async function readJson<T>(path: string, fallback: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { credentials: "include" });
  if (!response.ok) throw new ApiQueryError(await getApiError(response, fallback), response.status);
  return response.json() as Promise<T>;
}

export const queryKeys = {
  authenticated: ["authenticated"] as const,
  currentUser: ["authenticated", "current-user"] as const,
  profile: ["authenticated", "profile", "me"] as const,
  presets: ["presets"] as const,
  tracker: ["authenticated", "tracker"] as const,
  trackerJobs: ["authenticated", "tracker", "jobs"] as const,
  trackerStats: ["authenticated", "tracker", "stats"] as const,
  trackerDetails: (id: number) => ["authenticated", "tracker", "details", id] as const,
  adminUsers: ["authenticated", "admin", "users"] as const,
};

export const currentUserQueryOptions = () => queryOptions({
  queryKey: queryKeys.currentUser,
  queryFn: () => readJson<CurrentUser>("/auth/me", "Unable to load your account."),
  retry: false,
});

export const profileQueryOptions = () => queryOptions({
  queryKey: queryKeys.profile,
  queryFn: () => readJson<Profile>("/profile/me", "Unable to load your profile."),
  retry: false,
});

export const presetsQueryOptions = () => queryOptions({
  queryKey: queryKeys.presets,
  queryFn: () => readJson<PresetSummary[]>("/presets", "Unable to load resume presets."),
  staleTime: 30 * 60_000,
});

export const trackerJobsQueryOptions = () => queryOptions({
  queryKey: queryKeys.trackerJobs,
  queryFn: () => readJson<JobSummary[]>("/tracker", "Unable to load your applications."),
});

export const trackerStatsQueryOptions = () => queryOptions({
  queryKey: queryKeys.trackerStats,
  queryFn: () => readJson<TrackerStats>("/tracker/stats", "Unable to load application statistics."),
});

export const trackerDetailsQueryOptions = (id: number) => queryOptions({
  queryKey: queryKeys.trackerDetails(id),
  queryFn: () => readJson<JobDetails>(`/tracker/${id}/details`, "Unable to load application details."),
});

export const adminUsersQueryOptions = () => queryOptions({
  queryKey: queryKeys.adminUsers,
  queryFn: () => readJson<AdminUser[]>("/admin/users", "Unable to load users."),
});

export function useCurrentUser() {
  return useQuery(currentUserQueryOptions());
}

export function useAdminUsers(enabled = true) {
  return useQuery({ ...adminUsersQueryOptions(), enabled });
}

export function useProfile() {
  return useQuery(profileQueryOptions());
}

export function usePresets() {
  return useQuery(presetsQueryOptions());
}

export function useTrackerJobs(enabled = true) {
  return useQuery({ ...trackerJobsQueryOptions(), enabled });
}

export function useTrackerStats(enabled = true) {
  return useQuery({ ...trackerStatsQueryOptions(), enabled });
}

export function useTrackerDetails(id: number | null) {
  return useQuery<JobDetails>({
    queryKey: id === null ? ["authenticated", "tracker", "details", "none"] : queryKeys.trackerDetails(id),
    queryFn: () => readJson<JobDetails>(`/tracker/${id}/details`, "Unable to load application details."),
    enabled: id !== null,
  });
}

export function warmAuthenticatedData(queryClient: QueryClient) {
  return Promise.allSettled([
    queryClient.prefetchQuery(currentUserQueryOptions()),
    queryClient.prefetchQuery(profileQueryOptions()),
    queryClient.prefetchQuery(presetsQueryOptions()),
    queryClient.prefetchQuery(trackerJobsQueryOptions()),
  ]);
}
