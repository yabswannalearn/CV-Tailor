import { ArrowUpRight, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import type { PortfolioConfig } from "../data/types";
import { publicAsset, webLink } from "../public-links";
import type { PortfolioSection } from "../sections";

export interface DesignProps {
  profile: PortfolioConfig["profile"];
  sections: PortfolioSection[];
  toggle: ReactNode;
  siteUrl?: string;
}

export function SectionNav({ sections, indexed = false }: { sections: PortfolioSection[]; indexed?: boolean }) {
  return sections.length > 0 && (
    <nav aria-label="Portfolio sections">
      <ol className="p-nav-links" role="list">
        {sections.map(({ id, title }, index) => (
          <li key={id}>
            <a href={`#${id}`}>
              {indexed && <span className="p-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>}
              {title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function TopBar({ name, sections, toggle }: { name: string; sections: PortfolioSection[]; toggle: ReactNode }) {
  return (
    <header className="p-top">
      <div className="p-container p-top-inner">
        <a className="p-home" href="#portfolio">{name}</a>
        <SectionNav sections={sections} />
        {toggle}
      </div>
    </header>
  );
}

export function Avatar({ path }: { path?: string }) {
  const source = publicAsset(path);
  return source ? <img className="p-avatar" src={source} alt="" width={120} height={120} /> : null;
}

export function ProfileDetails({ profile }: { profile: DesignProps["profile"] }) {
  if (!profile.location?.trim() && !profile.availability?.trim()) return null;
  return <div className="p-profile-details">
    {profile.location?.trim() && <p><MapPin size={16} aria-hidden="true" />{profile.location}</p>}
    {profile.availability?.trim() && <p>{profile.availability}</p>}
  </div>;
}

export function ProfileHighlights({ profile, sections, siteUrl }: Omit<DesignProps, "toggle">) {
  const anchors = new Set(sections.map(section => `#${section.id}`));
  const canonical = webLink(siteUrl);
  const page = canonical ? new URL(canonical) : undefined;
  function resolveHref(href?: string) {
    if (href?.startsWith("#")) return anchors.has(href) ? href : undefined;
    const link = webLink(href);
    if (!link || !page) return link;
    const target = new URL(link);
    if (target.hash && target.origin === page.origin && target.pathname.replace(/\/$/, "") === page.pathname.replace(/\/$/, "")) {
      return anchors.has(target.hash) ? target.hash : undefined;
    }
    return link;
  }
  const actions = (profile.actions ?? []).map(action => ({ ...action, href: resolveHref(action.href) }))
    .filter(action => action.href && action.label.trim());
  const metrics = (profile.metrics ?? []).filter(metric => metric.label.trim() && metric.value.trim());
  if (!actions.length && !metrics.length) return null;
  return <>
    {actions.length > 0 && <div className="p-actions">
      {actions.map(({ href, label }, index) => <a key={index} href={href}>{label}<ArrowUpRight size={15} aria-hidden="true" /></a>)}
    </div>}
    {metrics.length > 0 && <ul className="p-metrics" role="list" aria-label="Portfolio highlights">
      {metrics.map(({ label, value, href }, index) => {
        const link = resolveHref(href);
        const fact = <><strong>{value}</strong><span>{label}</span></>;
        return <li key={index}>{link ? <a href={link}>{fact}</a> : fact}</li>;
      })}
    </ul>}
  </>;
}

export function Sections({ sections }: { sections: PortfolioSection[] }) {
  return sections.map(({ id, title, content }) => (
    <section className="p-section" id={id} key={id} tabIndex={-1} aria-labelledby={`p-label-${id}`}>
      <h2 id={`p-label-${id}`}>{title}</h2>
      <div className="p-section-content">{content}</div>
    </section>
  ));
}
