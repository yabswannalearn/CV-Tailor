import { Avatar, ProfileDetails, SectionNav, Sections, type DesignProps } from "./layout";

export function Technical({ profile, sections, toggle }: DesignProps) {
  return <div className="p-container p-technical-frame">
    <div className="p-technical-index">
      <header><a className="p-home" href="#portfolio">{profile.fullName}</a>{toggle}</header>
      <SectionNav sections={sections} indexed />
    </div>
    <main id="portfolio-main" tabIndex={-1}>
      <header className="p-intro">
        <div>
          <h1>{profile.fullName}</h1>
          <p className="p-headline">{profile.headline}</p>
          <ProfileDetails profile={profile} />
        </div>
        <Avatar path={profile.avatarPath} />
      </header>
      <Sections sections={sections} />
    </main>
  </div>;
}
