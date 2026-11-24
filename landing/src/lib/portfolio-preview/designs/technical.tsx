import {
  Avatar,
  PortfolioFooter,
  ProfileActions,
  ProfileDetails,
  ProfileMetrics,
  SectionNav,
  type DesignProps,
} from "../components/DesignChrome";
import { Sections } from "../components/Sections";

export function Technical({ profile, sections, activeSection, toggle, siteUrl }: DesignProps) {
  return (
    <div className="p-container p-technical-frame">
      <aside className="p-technical-index">
        <header>
          <a className="p-home" href="#portfolio">
            {profile.fullName}
          </a>
          {toggle}
        </header>
        <SectionNav sections={sections} activeSection={activeSection} indexed />
        <div className="p-technical-meta">
          <ProfileDetails profile={profile} />
        </div>
      </aside>
      <div className="p-technical-column">
        <main id="portfolio-main" tabIndex={-1}>
          <header className="p-intro">
            <div className="p-intro-copy">
              <span className="p-eyebrow">Engineering dossier</span>
              <h1>{profile.fullName}</h1>
              <p className="p-headline">{profile.headline}</p>
              <ProfileActions profile={profile} sections={sections} siteUrl={siteUrl} />
              <ProfileMetrics profile={profile} sections={sections} siteUrl={siteUrl} />
            </div>
            <Avatar path={profile.avatarPath} name={profile.fullName} />
          </header>
          <Sections sections={sections} />
        </main>
        <PortfolioFooter name={profile.fullName} />
      </div>
    </div>
  );
}
