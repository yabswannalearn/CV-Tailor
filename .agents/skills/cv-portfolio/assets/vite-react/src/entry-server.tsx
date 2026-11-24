import { renderToStaticMarkup, renderToString } from "react-dom/server";
import App from "./App";
import { portfolioConfig } from "./data/portfolio.config";
import { fontsUrlForDesign } from "./lib/portfolio-data";
import { portfolioSeo } from "./lib/seo";

const { title, description, siteUrl, sitemapUrl, sitemapLocation, socialImage, imageAlt, structuredData } =
  portfolioSeo(portfolioConfig);
const fontsUrl = fontsUrlForDesign(portfolioConfig.design);

export const renderedPage = renderToString(<App />);
export const renderedHead = renderToStaticMarkup(
  <>
    <title>{title}</title>
    <meta name="description" content={description} />
    <meta property="og:type" content="profile" />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta name="twitter:card" content={socialImage ? "summary_large_image" : "summary"} />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    {siteUrl && (
      <>
        <link rel="canonical" href={siteUrl} />
        <meta property="og:url" content={siteUrl} />
      </>
    )}
    {socialImage && (
      <>
        <meta property="og:image" content={socialImage} />
        <meta property="og:image:alt" content={imageAlt} />
        <meta name="twitter:image" content={socialImage} />
        <meta name="twitter:image:alt" content={imageAlt} />
      </>
    )}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    <link rel="stylesheet" href={fontsUrl} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
  </>,
);
export const robots = `User-agent: *\nAllow: /\n${sitemapUrl ? `\nSitemap: ${sitemapUrl}\n` : ""}`;
export const sitemap = sitemapLocation
  ? `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${sitemapLocation}</loc></url></urlset>\n`
  : undefined;
