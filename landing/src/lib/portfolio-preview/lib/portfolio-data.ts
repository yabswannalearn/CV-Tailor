import type { PortfolioConfig, PortfolioDesignId, PortfolioSectionId } from "../data/types";
import { publicAsset, resolvePortfolioHref, webLink } from "./public-links";

export const SECTION_TITLES: Record<PortfolioSectionId, string> = {
  about: "About",
  experience: "Experience",
  projects: "Projects",
  skills: "Skills",
  education: "Education",
  certifications: "Certifications",
  contact: "Contact",
};

export interface ContactLinkItem {
  kind: "email" | "phone" | "linkedin" | "github" | "website" | "resume" | "other";
  label: string;
  href: string;
  copyValue?: string;
}

export function getContactLinks(profile: PortfolioConfig["profile"]): ContactLinkItem[] {
  const { links } = profile;
  const email = profile.email?.trim();
  const rawPhone = profile.phone?.trim();
  const phone = rawPhone?.replace(/[^\d+]/g, "");
  const candidates: Array<ContactLinkItem | null> = [
    email ? { kind: "email", label: email, href: `mailto:${email}`, copyValue: email } : null,
    rawPhone && phone ? { kind: "phone", label: rawPhone, href: `tel:${phone}` } : null,
    webLink(links.linkedin) ? { kind: "linkedin", label: "LinkedIn", href: webLink(links.linkedin)! } : null,
    webLink(links.github) ? { kind: "github", label: "GitHub", href: webLink(links.github)! } : null,
    webLink(links.website) ? { kind: "website", label: "Website", href: webLink(links.website)! } : null,
    publicAsset(profile.resumePdfPath)
      ? { kind: "resume", label: "Download resume", href: publicAsset(profile.resumePdfPath)! }
      : null,
    ...(links.other ?? []).map((item): ContactLinkItem | null => {
      const href = webLink(item.url);
      return href && item.label.trim() ? { kind: "other", label: item.label.trim(), href } : null;
    }),
  ];
  return candidates.filter((item): item is ContactLinkItem => item !== null);
}

export function getVisibleSectionIds(config: PortfolioConfig): PortfolioSectionId[] {
  const hasSkills = config.skills.some((group) => group.items.some((item) => item.trim()));
  const hasContent: Record<PortfolioSectionId, boolean> = {
    about: Boolean(config.profile.summary?.trim()),
    experience: config.experience.length > 0,
    projects: config.projects.length > 0,
    skills: hasSkills,
    education: config.education.length > 0,
    certifications: config.certifications.length > 0,
    contact: getContactLinks(config.profile).length > 0,
  };
  return [...new Set(config.layout.sectionOrder)].filter(
    (id) => hasContent[id] && !config.layout.hiddenSections?.includes(id),
  );
}

export function getProjectTags(projects: PortfolioConfig["projects"]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const project of projects) {
    for (const raw of project.tags ?? []) {
      const tag = raw.trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(tag);
      }
    }
  }
  return ordered;
}

export function filterProjectsByTag(
  projects: PortfolioConfig["projects"],
  activeTag: string,
): PortfolioConfig["projects"] {
  if (activeTag === "all") return projects;
  const target = activeTag.toLowerCase();
  return projects.filter((project) => (project.tags ?? []).some((tag) => tag.trim().toLowerCase() === target));
}

export function getResolvedActions(
  profile: PortfolioConfig["profile"],
  visibleAnchors: ReadonlySet<string>,
  siteUrl?: string,
) {
  return (profile.actions ?? [])
    .map((action) => ({ label: action.label.trim(), href: resolvePortfolioHref(action.href, visibleAnchors, siteUrl) }))
    .filter((action): action is { label: string; href: string } => Boolean(action.href && action.label));
}

export function getResolvedMetrics(
  profile: PortfolioConfig["profile"],
  visibleAnchors: ReadonlySet<string>,
  siteUrl?: string,
) {
  return (profile.metrics ?? [])
    .filter((metric) => metric.label.trim() && metric.value.trim())
    .map((metric) => ({
      label: metric.label.trim(),
      value: metric.value.trim(),
      href: resolvePortfolioHref(metric.href, visibleAnchors, siteUrl),
    }));
}

const DESIGN_FONT_FAMILIES: Record<PortfolioDesignId, string[]> = {
  editorial: [
    "family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500",
    "family=Geist:wght@400;500;600;700",
    "family=Geist+Mono:wght@400;500;600",
  ],
  bento: [
    "family=Bricolage+Grotesque:wght@500;600;700;800",
    "family=Geist:wght@400;500;600;700",
    "family=Geist+Mono:wght@400;500;600",
  ],
  technical: [
    "family=Space+Grotesk:wght@500;600;700",
    "family=IBM+Plex+Sans:wght@400;500;600",
    "family=JetBrains+Mono:wght@400;500;600",
  ],
  "case-study": [
    "family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400",
    "family=Geist:wght@400;500;600;700",
    "family=Geist+Mono:wght@400;500;600",
  ],
  executive: [
    "family=Libre+Baskerville:ital,wght@0,400;0,700;1,400",
    "family=Geist:wght@400;500;600;700",
    "family=Geist+Mono:wght@400;500;600",
  ],
  "bold-studio": [
    "family=Syne:wght@600;700;800",
    "family=Geist:wght@400;500;600;700",
    "family=Geist+Mono:wght@400;500;600",
  ],
};

export function fontsUrlForDesign(design: PortfolioDesignId): string {
  return `https://fonts.googleapis.com/css2?${DESIGN_FONT_FAMILIES[design].join("&")}&display=swap`;
}
