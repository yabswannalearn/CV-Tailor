import { portfolioConfig } from "../data/portfolio.config";
import { PortfolioRenderer } from "../portfolio-renderer";

export default function Page() {
  return <PortfolioRenderer config={portfolioConfig} />;
}
