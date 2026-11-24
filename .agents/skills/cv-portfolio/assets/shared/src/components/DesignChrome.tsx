import { ArrowUpRight, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import type { PortfolioConfig, PortfolioSectionId } from "../data/types";
import { getResolvedActions, getResolvedMetrics } from "../lib/portfolio-data";
import { publicAsset } from "../lib/public-links";
import type { PortfolioSectionItem } from "./Sections";

export interface DesignProps {
  profile: PortfolioConfig["profile"];
  sections: PortfolioSectionItem[];
  activeSection?: PortfolioSectionId;
  toggle: ReactNode;
  siteUrl?: string;
}

export function SectionNav({
  sections,
  activeSection,
  indexed = false,
}: {
  sections: PortfolioSectionItem[];
  activeSection?: PortfolioSectionId;
  indexed?: boolean;
}) {
  if (!sections.length) return null;
  return (
    <nav aria-label="Portfolio sections">
      <ol className="p-nav-links" role="list">
        {sections.map(({ id, title }, index) => {
          const active = activeSection === id;
          return (
            <li key={id}>
              <a href={`#${id}`} aria-current={active ? "location" : undefined} data-active={active || undefined}>
                {indexed && (
                  <span className="p-index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                )}
                <span>{title}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function TopBar({
  name,
  sections,
  activeSection,
  toggle,
}: {
  name: string;
  sections: PortfolioSectionItem[];
  activeSection?: PortfolioSectionId;
  toggle: ReactNode;
}) {
  return (
    <header className="p-top">
      <div className="p-container p-top-inner">
        <a className="p-home" href="#portfolio">
          {name}
        </a>
        <SectionNav sections={sections} activeSection={activeSection} />
        {toggle}
      </div>
    </header>
  );
}

export function Avatar({ path, name }: { path?: string; name?: string }) {
  const source = publicAsset(path);
  return source ? <img className="p-avatar" src={source} alt={name ? `Portrait of ${name}` : ""} width={120} height={120} /> : null;
}

export function ProfileDetails({ profile }: { profile: DesignProps["profile"] }) {
  const location = profile.location?.trim();
  const availability = profile.availability?.trim();
  if (!location && !availability) return null;
  return (
    <div className="p-profile-details">
      {availability && (
        <p className="p-availability">
          <span className="p-status-dot" aria-hidden="true" />
          <span>{availability}</span>
        </p>
      )}
      {location && (
        <p className="p-location">
          <MapPin size={15} aria-hidden="true" />
          <span>{location}</span>
        </p>
      )}
    </div>
  );
}

export function ProfileActions({
  profile,
  sections,
  siteUrl,
}: Pick<DesignProps, "profile" | "sections" | "siteUrl">) {
  const anchors = new Set(sections.map((section) => `#${section.id}`));
  const actions = getResolvedActions(profile, anchors, siteUrl);
  if (!actions.length) return null;
  return (
    <div className="p-actions">
      {actions.map(({ href, label }, index) => {
        const external = href.startsWith("http://") || href.startsWith("https://");
        return (
          <a
            key={`${label}-${index}`}
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer" : undefined}
          >
            <span>{label}</span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        );
      })}
    </div>
  );
}

export function ProfileMetrics({
  profile,
  sections,
  siteUrl,
}: Pick<DesignProps, "profile" | "sections" | "siteUrl">) {
  const anchors = new Set(sections.map((section) => `#${section.id}`));
  const metrics = getResolvedMetrics(profile, anchors, siteUrl);
  if (!metrics.length) return null;
  return (
    <ul className="p-metrics" role="list" aria-label="Portfolio highlights">
      {metrics.map(({ label, value, href }, index) => {
        const external = href?.startsWith("http://") || href?.startsWith("https://");
        const content = (
          <>
            <strong>{value}</strong>
            <span>{label}</span>
          </>
        );
        return (
          <li key={`${label}-${index}`}>
            {href ? (
              <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
                {content}
              </a>
            ) : (
              <div className="p-metric-static">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function PortfolioFooter({ name }: { name: string }) {
  return (
    <footer className="p-footer">
      <div className="p-container p-footer-inner">
        <span>{name}</span>
        <a href="#portfolio">Back to top</a>
      </div>
    </footer>
  );
}
