import type { Metadata } from "next";
import type { ReactNode } from "react";
import { portfolioConfig } from "../data/portfolio.config";
import "../portfolio.css";

const { profile, seo } = portfolioConfig;
const title = seo?.title || `${profile.fullName} | ${profile.headline}`;
const description = seo?.description || profile.summary || profile.headline;

export const metadata: Metadata = {
  title,
  description,
  openGraph: { type: "website", title, description, url: seo?.siteUrl },
  alternates: seo?.siteUrl ? { canonical: seo.siteUrl } : undefined,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
