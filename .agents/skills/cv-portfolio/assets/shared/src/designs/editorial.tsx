import { Avatar, ProfileDetails, ProfileHighlights, Sections, TopBar, type DesignProps } from "./layout";

export function Editorial({ profile, sections, toggle, siteUrl }: DesignProps) {
  return <>
    <TopBar name={profile.fullName} sections={sections} toggle={toggle} />
    <main className="p-container" id="portfolio-main" tabIndex={-1}>
      <header className="p-intro">
        <Avatar path={profile.avatarPath} />
        <div>
          <h1>{profile.fullName}</h1>
          <p className="p-headline">{profile.headline}</p>
          <ProfileDetails profile={profile} />
          <ProfileHighlights profile={profile} sections={sections} siteUrl={siteUrl} />
        </div>
      </header>
      <Sections sections={sections} />
    </main>
  </>;
}
