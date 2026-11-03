import type { MetadataRoute } from "next";
import { guides } from "../lib/guides";
import { SITE_URL } from "../lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/` },
    ...guides.map(guide => ({ url: `${SITE_URL}/guides/${guide.slug}/` })),
  ];
}
