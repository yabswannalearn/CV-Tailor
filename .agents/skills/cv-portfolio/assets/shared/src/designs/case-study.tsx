import { Avatar, ProfileDetails, Sections, TopBar, type DesignProps } from "./layout";

export function CaseStudy({ profile, sections, toggle }: DesignProps) {
  return <>
    <TopBar name={profile.fullName} sections={sections} toggle={toggle} />
    <main id="portfolio-main" tabIndex={-1}>
      <header className="p-case-band">
        <div className="p-container p-intro">
          <h1>{profile.fullName}</h1>
          <div className="p-case-role">
            <Avatar path={profile.avatarPath} />
            <p className="p-headline">{profile.headline}</p>
            <ProfileDetails profile={profile} />
          </div>
        </div>
      </header>
      <div className="p-container"><Sections sections={sections} /></div>
    </main>
  </>;
}
