import type { PortfolioConfig } from "../data/types";
import { publicAsset, webLink } from "./public-links";

function summarySnippet(summary: string) {
  const text = summary.replace(/\s+/g, " ").trim();
  if (text.length <= 160) return text;
  return `${text.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}

export function portfolioSeo(config: PortfolioConfig) {
  const { profile, seo, layout } = config;
  const url = webLink(seo?.siteUrl);
  const canonical = url ? new URL(url) : undefined;
  if (canonical) {
    canonical.search = "";
    canonical.hash = "";
  }
  const siteUrl = canonical?.href;
  const sitemapLocation = siteUrl?.replace(/&/g, "&amp;").replace(/'/g, "&apos;");
  const assetBase = canonical ? new URL(canonical) : undefined;
  if (assetBase && !assetBase.pathname.endsWith("/")) assetBase.pathname += "/";
  const sitemapUrl = assetBase ? new URL("sitemap.xml", assetBase).href : undefined;
  const visible = (id: "about" | "contact") => layout.sectionOrder.includes(id) && !layout.hiddenSections?.includes(id);
  const title = seo?.title?.trim() || `${profile.fullName} | ${profile.headline}`;
  const description = seo?.description?.trim() || (visible("about") && summarySnippet(profile.summary ?? "")) || profile.headline;
  const imagePath = publicAsset(seo?.imagePath);
  const socialImage = webLink(seo?.imagePath) ?? (imagePath && assetBase ? new URL(`.${imagePath}`, assetBase).href : undefined);
  const imageAlt = seo?.imageAlt?.trim() || title;
  const avatarPath = publicAsset(profile.avatarPath);
  const personImage = avatarPath && assetBase ? new URL(`.${avatarPath}`, assetBase).href : undefined;
  const { linkedin, github, website } = profile.links;
  const sameAs = visible("contact") ? [...new Set([linkedin, github, website].map(webLink).filter(Boolean))] : [];
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: siteUrl,
    name: title,
    description,
    mainEntity: {
      "@type": "Person",
      name: profile.fullName,
      jobTitle: profile.headline,
      url: siteUrl,
      image: personImage,
      sameAs: sameAs.length ? sameAs : undefined,
    },
  }).replace(/</g, "\\u003c");
  return { title, description, siteUrl, sitemapUrl, sitemapLocation, socialImage, imageAlt, structuredData };
}
