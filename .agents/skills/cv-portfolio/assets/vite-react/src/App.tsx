import { portfolioConfig } from "./data/portfolio.config";
import { PortfolioRenderer } from "./portfolio-renderer";

export default function App() {
  return <PortfolioRenderer config={portfolioConfig} />;
}
