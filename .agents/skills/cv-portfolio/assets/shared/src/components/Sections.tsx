import type { ReactNode } from "react";
import type { PortfolioConfig, PortfolioSectionId } from "../data/types";
import { getContactLinks, getVisibleSectionIds, SECTION_TITLES } from "../lib/portfolio-data";
import { ContactSection } from "./ContactSection";
import { ExperienceSection } from "./ExperienceSection";
import { ImpactText } from "./ImpactText";
import { ProjectsSection } from "./ProjectsSection";

export interface PortfolioSectionItem {
  id: PortfolioSectionId;
  title: string;
  content: ReactNode;
}

export function buildPortfolioSections(config: PortfolioConfig): PortfolioSectionItem[] {
  const visibleIds = getVisibleSectionIds(config);
  const contactLinks = getContactLinks(config.profile);
  const skillGroups = config.skills.filter((group) => group.items.some((item) => item.trim()));

  const contentMap: Record<PortfolioSectionId, ReactNode> = {
    about: config.profile.summary?.trim() ? (
      <p className="p-about">
        <ImpactText text={config.profile.summary} />
      </p>
    ) : null,
    experience: config.experience.length ? <ExperienceSection entries={config.experience} /> : null,
    projects: config.projects.length ? <ProjectsSection entries={config.projects} /> : null,
    skills: skillGroups.length ? (
      <div className="p-skills-grid">
        {skillGroups.map((group, index) => (
          <div className="p-skill-group" key={`${group.category ?? "skills"}-${index}`}>
            {group.category?.trim() && <h3>{group.category}</h3>}
            <ul className="p-tags" role="list">
              {[...new Set(group.items.map((item) => item.trim()).filter(Boolean))].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    ) : null,
    education: config.education.length ? (
      <div className="p-entries">
        {config.education.map((entry, index) => {
          const meta = [entry.dateRange, entry.location].filter((item) => item?.trim());
          return (
            <article className="p-entry" key={`${entry.schoolName}-${index}`}>
              <div className="p-entry-heading">
                <h3>{entry.course}</h3>
                <p className="p-organization">{entry.schoolName}</p>
                {meta.length > 0 && <p className="p-meta">{meta.join(" · ")}</p>}
              </div>
              {entry.description?.trim() && (
                <div className="p-entry-body">
                  <p className="p-description">{entry.description}</p>
                </div>
              )}
            </article>
          );
        })}
      </div>
    ) : null,
    certifications: config.certifications.length ? (
      <ul className="p-certifications" role="list">
        {config.certifications.map((item, index) => {
          const meta = [item.issuer, item.dateIssued].filter((v) => v?.trim());
          return (
            <li className="p-cert-item" key={`${item.name}-${index}`}>
              <strong>{item.name}</strong>
              {meta.length > 0 && <span className="p-meta">{meta.join(" · ")}</span>}
            </li>
          );
        })}
      </ul>
    ) : null,
    contact: contactLinks.length ? <ContactSection links={contactLinks} /> : null,
  };

  return visibleIds.map((id) => ({
    id,
    title: SECTION_TITLES[id],
    content: contentMap[id],
  }));
}

export function Sections({ sections }: { sections: PortfolioSectionItem[] }) {
  return (
    <>
      {sections.map(({ id, title, content }) => (
        <section className="p-section" id={id} key={id} tabIndex={-1} aria-labelledby={`p-label-${id}`}>
          <div className="p-section-header">
            <h2 id={`p-label-${id}`}>{title}</h2>
          </div>
          <div className="p-section-content">{content}</div>
        </section>
      ))}
    </>
  );
}
