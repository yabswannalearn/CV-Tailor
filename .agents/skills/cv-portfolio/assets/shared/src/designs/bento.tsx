import { Avatar, ProfileDetails, SectionNav, Sections, type DesignProps } from "./layout";

export function Bento({ profile, sections, toggle }: DesignProps) {
  return <main className="p-container" id="portfolio-main" tabIndex={-1}>
    <header className="p-bento-header">
      <div className="p-intro">
        <Avatar path={profile.avatarPath} />
        <h1>{profile.fullName}</h1>
        <p className="p-headline">{profile.headline}</p>
      </div>
      <div className="p-bento-nav">
        {toggle}
        <ProfileDetails profile={profile} />
        <SectionNav sections={sections} />
      </div>
    </header>
    <Sections sections={sections} />
  </main>;
}
