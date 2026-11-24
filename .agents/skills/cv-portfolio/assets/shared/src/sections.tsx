import { ArrowUpRight, Briefcase, Code, Download, Globe, Mail, Phone } from "lucide-react";
import type { ReactNode } from "react";
import type { PortfolioConfig, PortfolioSectionId } from "./data/types";

const titles: Record<PortfolioSectionId, string> = {
  about: "About",
  experience: "Experience",
  projects: "Projects",
  skills: "Skills",
  education: "Education",
  certifications: "Certifications",
  contact: "Contact",
};

export interface PortfolioSection {
  id: PortfolioSectionId;
  title: string;
  content: ReactNode;
}

function webLink(url?: string) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

export function publicAsset(path?: string) {
  return path?.startsWith("/") && !path.startsWith("//") && !/[\\\t\n\r]/.test(path) ? path : undefined;
}

export function Metadata({ items }: { items: (string | undefined)[] }) {
  const visible = items.filter(item => item?.trim());
  return visible.length > 0 && <p className="p-meta">{visible.join(" · ")}</p>;
}

function Highlights({ items = [] }: { items?: string[] }) {
  const visible = items.filter(item => item.trim());
  return visible.length > 0 && <ul className="p-highlights">{visible.map((item, i) => <li key={i}>{item}</li>)}</ul>;
}

function Tags({ items = [] }: { items?: string[] }) {
  const visible = [...new Set(items.filter(item => item.trim()))];
  return visible.length > 0 && <ul className="p-tags" role="list">{visible.map(item => <li key={item}>{item}</li>)}</ul>;
}

function Experience({ entries }: { entries: PortfolioConfig["experience"] }) {
  return <div className="p-entries">{entries.map((entry, index) => (
    <article className="p-entry" key={index}>
      <div className="p-entry-heading">
        <h3>{entry.jobTitle}</h3>
        <p className="p-organization">{entry.company}</p>
      </div>
      <div className="p-entry-body">
        <Metadata items={[entry.dateRange, entry.location]} />
        {entry.summary?.trim() && <p className="p-description">{entry.summary}</p>}
        <Highlights items={entry.highlights} />
      </div>
    </article>
  ))}</div>;
}

function Projects({ entries }: { entries: PortfolioConfig["projects"] }) {
  return <div className="p-projects">{entries.map((project, index) => {
    const live = webLink(project.liveUrl);
    const repo = webLink(project.repoUrl);
    const image = publicAsset(project.imagePath);
    return (
      <article className="p-project" key={index}>
        <div className="p-project-heading">
          <span className="p-project-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <h3>{project.name}</h3>
          <Metadata items={[project.role, project.dateRange]} />
        </div>
        <div className="p-project-body">
          {image && <img className="p-project-image" src={image} alt={`${project.name} screenshot`} loading="lazy" />}
          {project.tagline?.trim() && <p className="p-tagline">{project.tagline}</p>}
          {project.description?.trim() && <p className="p-description">{project.description}</p>}
          <Highlights items={project.highlights} />
          <Tags items={project.tags} />
          {(live || repo) && <div className="p-links">
            {live && <a href={live} aria-label={`Visit ${project.name}`}><ArrowUpRight size={16} aria-hidden="true" />Live project</a>}
            {repo && <a href={repo} aria-label={`View source for ${project.name}`}><Code size={16} aria-hidden="true" />Source code</a>}
          </div>}
        </div>
      </article>
    );
  })}</div>;
}

function Education({ entries }: { entries: PortfolioConfig["education"] }) {
  return <div className="p-entries">{entries.map((entry, index) => (
    <article className="p-entry" key={index}>
      <div className="p-entry-heading">
        <h3>{entry.course}</h3>
        <p className="p-organization">{entry.schoolName}</p>
      </div>
      <div className="p-entry-body">
        <Metadata items={[entry.dateRange, entry.location]} />
        {entry.description?.trim() && <p className="p-description">{entry.description}</p>}
      </div>
    </article>
  ))}</div>;
}

function contactLinks(profile: PortfolioConfig["profile"]) {
  const { links } = profile;
  const phone = profile.phone?.replace(/[^\d+]/g, "");
  return [
    { label: "Email", href: profile.email?.trim() ? `mailto:${profile.email.trim()}` : undefined, icon: Mail },
    { label: profile.phone, href: phone ? `tel:${phone}` : undefined, icon: Phone },
    { label: "LinkedIn", href: webLink(links.linkedin), icon: Briefcase },
    { label: "GitHub", href: webLink(links.github), icon: Code },
    { label: "Website", href: webLink(links.website), icon: Globe },
    { label: "Download resume", href: publicAsset(profile.resumePdfPath), icon: Download },
    ...(links.other ?? []).map(link => ({ label: link.label, href: webLink(link.url), icon: ArrowUpRight })),
  ].filter(link => link.href && link.label?.trim());
}

export function portfolioSections(config: PortfolioConfig): PortfolioSection[] {
  const links = contactLinks(config.profile);
  const skills = config.skills.filter(group => group.items.some(item => item.trim()));
  const content: Record<PortfolioSectionId, ReactNode> = {
    about: config.profile.summary?.trim() ? <p className="p-about">{config.profile.summary}</p> : null,
    experience: config.experience.length ? <Experience entries={config.experience} /> : null,
    projects: config.projects.length ? <Projects entries={config.projects} /> : null,
    education: config.education.length ? <Education entries={config.education} /> : null,
    skills: skills.length ? <div className="p-entries">{skills.map((group, index) => (
      <div className="p-skill-group" key={index}>
        {group.category?.trim() && <h3>{group.category}</h3>}
        <Tags items={group.items} />
      </div>
    ))}</div> : null,
    certifications: config.certifications.length ? <ul className="p-certifications" role="list">{config.certifications.map((item, index) => (
      <li key={index}><strong>{item.name}</strong><Metadata items={[item.issuer, item.dateIssued]} /></li>
    ))}</ul> : null,
    contact: links.length ? <ul className="p-links" role="list">{links.map(({ href, label, icon: Icon }, index) => (
      <li key={index}><a href={href}><Icon size={17} aria-hidden="true" />{label}</a></li>
    ))}</ul> : null,
  };
  return [...new Set(config.layout.sectionOrder)]
    .filter(id => content[id] && !config.layout.hiddenSections?.includes(id))
    .map(id => ({ id, title: titles[id], content: content[id] }));
}
