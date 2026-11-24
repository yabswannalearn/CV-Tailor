import type { MetadataRoute } from "next";
import { portfolioConfig } from "../data/portfolio.config";
import { portfolioSeo } from "../lib/seo";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: portfolioSeo(portfolioConfig).sitemapUrl };
}
