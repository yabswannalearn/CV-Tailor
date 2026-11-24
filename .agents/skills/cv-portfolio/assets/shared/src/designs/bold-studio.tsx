import { Avatar, ProfileDetails, Sections, TopBar, type DesignProps } from "./layout";

export function BoldStudio({ profile, sections, toggle }: DesignProps) {
  return <>
    <TopBar name={profile.fullName} sections={sections} toggle={toggle} />
    <main className="p-container" id="portfolio-main" tabIndex={-1}>
      <header className="p-intro">
        <h1>{profile.fullName}</h1>
        <div className="p-studio-caption">
          <Avatar path={profile.avatarPath} />
          <p className="p-headline">{profile.headline}</p>
          <ProfileDetails profile={profile} />
        </div>
      </header>
      <Sections sections={sections} />
    </main>
  </>;
}
