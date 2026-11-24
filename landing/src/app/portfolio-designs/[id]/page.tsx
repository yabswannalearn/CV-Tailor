import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PORTFOLIO_DESIGNS, PORTFOLIO_PREVIEW_CONFIGS } from "../../../lib/portfolioDesigns";
import { fontsUrlForDesign } from "../../../lib/portfolio-preview/lib/portfolio-data";
import { PortfolioRenderer } from "../../../lib/portfolio-preview/portfolio-renderer";
import type { PortfolioDesignId } from "../../../lib/portfolio-preview/data/types";
import "../../../lib/portfolio-preview/portfolio-core.css";

const validIds = new Set<string>(PORTFOLIO_DESIGNS.map((design) => design.id));

export function generateStaticParams() {
  return PORTFOLIO_DESIGNS.map(({ id }) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const design = PORTFOLIO_DESIGNS.find((item) => item.id === id);
  if (!design) return {};
  return {
    title: `${design.name} — Live Portfolio Preview | CV Tailor`,
    description: design.tagline,
    robots: { index: false, follow: false },
  };
}

export default async function PortfolioDesignPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validIds.has(id)) notFound();
  const designId = id as PortfolioDesignId;
  const config = PORTFOLIO_PREVIEW_CONFIGS[designId];
  const fontsUrl = fontsUrlForDesign(designId);

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={fontsUrl} />
      <PortfolioRenderer config={config} />
    </>
  );
}
