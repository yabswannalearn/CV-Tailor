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

export function CaseStudy({ profile, sections, activeSection, toggle, siteUrl }: DesignProps) {
  return (
    <>
      <TopBar name={profile.fullName} sections={sections} activeSection={activeSection} toggle={toggle} />
      <main id="portfolio-main" tabIndex={-1}>
        <header className="p-case-band">
          <div className="p-container">
            <div className="p-intro">
              <div className="p-case-lead">
                <ProfileDetails profile={profile} />
                <h1>{profile.fullName}</h1>
              </div>
              <div className="p-case-role">
                <Avatar path={profile.avatarPath} name={profile.fullName} />
                <p className="p-headline">{profile.headline}</p>
                <ProfileActions profile={profile} sections={sections} siteUrl={siteUrl} />
              </div>
            </div>
            <div className="p-case-metrics">
              <ProfileMetrics profile={profile} sections={sections} siteUrl={siteUrl} />
            </div>
          </div>
        </header>
        <div className="p-container">
          <Sections sections={sections} />
        </div>
      </main>
      <PortfolioFooter name={profile.fullName} />
    </>
  );
}
