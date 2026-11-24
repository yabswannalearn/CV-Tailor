import { MapPin } from "lucide-react";
import type { ReactNode } from "react";
import type { PortfolioConfig } from "../data/types";
import { publicAsset, type PortfolioSection } from "../sections";

export interface DesignProps {
  profile: PortfolioConfig["profile"];
  sections: PortfolioSection[];
  toggle: ReactNode;
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

export function Sections({ sections }: { sections: PortfolioSection[] }) {
  return sections.map(({ id, title, content }) => (
    <section className="p-section" id={id} key={id} aria-labelledby={`p-label-${id}`}>
      <h2 id={`p-label-${id}`}>{title}</h2>
      <div className="p-section-content">{content}</div>
    </section>
  ));
}
