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

export function Bento({ profile, sections, activeSection, toggle, siteUrl }: DesignProps) {
  return (
    <>
      <main className="p-container" id="portfolio-main" tabIndex={-1}>
        <header className="p-bento-header">
          <div className="p-intro p-bento-card">
            <div className="p-bento-identity">
              <Avatar path={profile.avatarPath} name={profile.fullName} />
              <div>
                <p className="p-eyebrow">Portfolio</p>
                <h1>{profile.fullName}</h1>
              </div>
            </div>
            <p className="p-headline">{profile.headline}</p>
            <ProfileActions profile={profile} sections={sections} siteUrl={siteUrl} />
          </div>
          <aside className="p-bento-side">
            <div className="p-bento-nav p-bento-card">
              <div className="p-bento-nav-head">
                <span className="p-eyebrow">Navigate</span>
                {toggle}
              </div>
              <ProfileDetails profile={profile} />
              <SectionNav sections={sections} activeSection={activeSection} />
            </div>
          </aside>
        </header>
        <div className="p-bento-metrics">
          <ProfileMetrics profile={profile} sections={sections} siteUrl={siteUrl} />
        </div>
        <div className="p-bento-sections">
          <Sections sections={sections} />
        </div>
      </main>
      <PortfolioFooter name={profile.fullName} />
    </>
  );
}
