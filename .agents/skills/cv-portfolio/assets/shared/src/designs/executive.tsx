import { Avatar, ProfileDetails, SectionNav, Sections, type DesignProps } from "./layout";

export function Executive({ profile, sections, toggle }: DesignProps) {
  return <main className="p-container" id="portfolio-main" tabIndex={-1}>
    <header className="p-executive-header">
      <div className="p-intro">
        <div className="p-executive-name">
          <Avatar path={profile.avatarPath} />
          <h1>{profile.fullName}</h1>
        </div>
        <div className="p-executive-role">
          <p className="p-headline">{profile.headline}</p>
          <ProfileDetails profile={profile} />
        </div>
      </div>
      <div className="p-executive-nav"><SectionNav sections={sections} />{toggle}</div>
    </header>
    <Sections sections={sections} />
  </main>;
}
