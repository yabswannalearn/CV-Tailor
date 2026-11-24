import { portfolioConfig } from "./data/portfolio.config";
import { PortfolioRenderer } from "./portfolio-renderer";

export default function App() {
  const { profile, seo } = portfolioConfig;
  return <>
    <title>{seo?.title || `${profile.fullName} | ${profile.headline}`}</title>
    <meta name="description" content={seo?.description || profile.summary || profile.headline} />
    <PortfolioRenderer config={portfolioConfig} />
  </>;
}
