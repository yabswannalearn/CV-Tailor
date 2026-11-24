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

export function Executive({ profile, sections, activeSection, toggle, siteUrl }: DesignProps) {
  return (
    <>
      <main className="p-container" id="portfolio-main" tabIndex={-1}>
        <header className="p-executive-header">
          <div className="p-intro">
            <div className="p-executive-name">
              <Avatar path={profile.avatarPath} name={profile.fullName} />
              <div>
                <ProfileDetails profile={profile} />
                <h1>{profile.fullName}</h1>
              </div>
            </div>
            <div className="p-executive-role">
              <p className="p-headline">{profile.headline}</p>
              <ProfileActions profile={profile} sections={sections} siteUrl={siteUrl} />
            </div>
          </div>
          <div className="p-executive-metrics">
            <ProfileMetrics profile={profile} sections={sections} siteUrl={siteUrl} />
          </div>
          <div className="p-executive-nav">
            <SectionNav sections={sections} activeSection={activeSection} />
            {toggle}
          </div>
        </header>
        <Sections sections={sections} />
      </main>
      <PortfolioFooter name={profile.fullName} />
    </>
  );
}
