export type PortfolioDesignId =
  | "editorial"
  | "bento"
  | "technical"
  | "case-study"
  | "executive"
  | "bold-studio";

export type PortfolioSectionId =
  | "about"
  | "experience"
  | "projects"
  | "skills"
  | "education"
  | "certifications"
  | "contact";

export type ColorMode = "system" | "light" | "dark";

export interface PortfolioConfig {
  design: PortfolioDesignId;
  theme: {
    colorMode: ColorMode;
    accent?: string;
  };
  layout: {
    sectionOrder: PortfolioSectionId[];
    hiddenSections?: PortfolioSectionId[];
    density?: "comfortable" | "compact";
  };
  profile: {
    fullName: string;
    headline: string;
    summary?: string;
    location?: string;
    availability?: string;
    email?: string;
    phone?: string;
    resumePdfPath?: string;
    avatarPath?: string;
    links: {
      linkedin?: string;
      github?: string;
      website?: string;
      other?: { label: string; url: string }[];
    };
  };
  experience: Array<{
    jobTitle: string;
    company: string;
    location?: string;
    dateRange: string;
    summary?: string;
    highlights: string[];
  }>;
  projects: Array<{
    name: string;
    tagline?: string;
    description: string;
    dateRange?: string;
    role?: string;
    highlights?: string[];
    tags?: string[];
    liveUrl?: string;
    repoUrl?: string;
    imagePath?: string;
  }>;
  skills: Array<{
    category?: string;
    items: string[];
  }>;
  education: Array<{
    schoolName: string;
    course: string;
    location?: string;
    dateRange?: string;
    description?: string;
  }>;
  certifications: Array<{
    name: string;
    issuer?: string;
    dateIssued?: string;
  }>;
  seo?: {
    title?: string;
    description?: string;
    siteUrl?: string;
  };
}
