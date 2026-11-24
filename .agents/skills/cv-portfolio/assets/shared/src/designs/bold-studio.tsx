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

export function BoldStudio({ profile, sections, activeSection, toggle, siteUrl }: DesignProps) {
  return (
    <>
      <TopBar name={profile.fullName} sections={sections} activeSection={activeSection} toggle={toggle} />
      <main className="p-container" id="portfolio-main" tabIndex={-1}>
        <header className="p-intro">
          <div className="p-studio-eyebrow">
            <ProfileDetails profile={profile} />
          </div>
          <h1>
            {profile.fullName}
            <span className="p-period" aria-hidden="true">.</span>
          </h1>
          <div className="p-studio-caption">
            <Avatar path={profile.avatarPath} name={profile.fullName} />
            <p className="p-headline">{profile.headline}</p>
            <ProfileActions profile={profile} sections={sections} siteUrl={siteUrl} />
          </div>
          <div className="p-studio-metrics">
            <ProfileMetrics profile={profile} sections={sections} siteUrl={siteUrl} />
          </div>
        </header>
        <Sections sections={sections} />
      </main>
      <PortfolioFooter name={profile.fullName} />
    </>
  );
}
