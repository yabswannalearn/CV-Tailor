import type { MetadataRoute } from "next";
import { portfolioConfig } from "../data/portfolio.config";
import { portfolioSeo } from "../seo";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  // The Next.js sitemap serializer writes the location directly into XML.
  const { sitemapLocation } = portfolioSeo(portfolioConfig);
  return sitemapLocation ? [{ url: sitemapLocation }] : [];
}
