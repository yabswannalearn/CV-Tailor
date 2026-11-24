import type { Metadata } from "next";
import type { ReactNode } from "react";
import { portfolioConfig } from "../data/portfolio.config";
import { fontsUrlForDesign } from "../lib/portfolio-data";
import { portfolioSeo } from "../lib/seo";
import "../portfolio.css";

const { title, description, siteUrl, socialImage, imageAlt, structuredData } = portfolioSeo(portfolioConfig);
const images = socialImage ? [{ url: socialImage, alt: imageAlt }] : undefined;
const fontsUrl = fontsUrlForDesign(portfolioConfig.design);

export const metadata: Metadata = {
  title,
  description,
  openGraph: { type: "profile", title, description, url: siteUrl, images },
  twitter: { card: socialImage ? "summary_large_image" : "summary", title, description, images },
  alternates: siteUrl ? { canonical: siteUrl } : undefined,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={fontsUrl} />
      </head>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
        {children}
      </body>
    </html>
  );
}
