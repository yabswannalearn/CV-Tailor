import {
  Avatar,
  PortfolioFooter,
  ProfileActions,
  ProfileDetails,
  ProfileMetrics,
  TopBar,
  type DesignProps,
} from "../components/DesignChrome";
import { Sections } from "../components/Sections";

export function Editorial({ profile, sections, activeSection, toggle, siteUrl }: DesignProps) {
  return (
    <>
      <TopBar name={profile.fullName} sections={sections} activeSection={activeSection} toggle={toggle} />
      <main className="p-container" id="portfolio-main" tabIndex={-1}>
        <header className="p-intro">
          <div className="p-intro-copy">
            <ProfileDetails profile={profile} />
            <h1>
              {profile.fullName}
              <span className="p-period" aria-hidden="true">.</span>
            </h1>
            <p className="p-headline">{profile.headline}</p>
            <ProfileActions profile={profile} sections={sections} siteUrl={siteUrl} />
          </div>
          <Avatar path={profile.avatarPath} name={profile.fullName} />
        </header>
        <div className="p-editorial-metrics">
          <ProfileMetrics profile={profile} sections={sections} siteUrl={siteUrl} />
        </div>
        <Sections sections={sections} />
      </main>
      <PortfolioFooter name={profile.fullName} />
    </>
  );
}
