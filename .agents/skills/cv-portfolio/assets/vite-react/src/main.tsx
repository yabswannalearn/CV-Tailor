import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import { portfolioConfig } from "./data/portfolio.config";
import { portfolioSeo } from "./lib/seo";
import "./portfolio.css";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);
if (root.hasChildNodes()) {
  hydrateRoot(root, app);
} else {
  document.title = portfolioSeo(portfolioConfig).title;
  createRoot(root).render(app);
}
