"use client";

import { Moon, Sun } from "lucide-react";
import { useState, useSyncExternalStore, type CSSProperties } from "react";
import type { PortfolioConfig } from "./data/types";
import { Bento } from "./designs/bento";
import { BoldStudio } from "./designs/bold-studio";
import { CaseStudy } from "./designs/case-study";
import { Editorial } from "./designs/editorial";
import { Executive } from "./designs/executive";
import { Technical } from "./designs/technical";
import { portfolioSections } from "./sections";

const designs = { editorial: Editorial, bento: Bento, technical: Technical, "case-study": CaseStudy, executive: Executive, "bold-studio": BoldStudio };
const accentTokens = ["cobalt", "plum", "pine", "ember"];
const colorQuery = "(prefers-color-scheme: dark)";

function subscribeToColorScheme(onChange: () => void) {
  const media = window.matchMedia(colorQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function PortfolioRenderer({ config }: { config: PortfolioConfig }) {
  const [mode, setMode] = useState(config.theme.colorMode);
  const systemDark = useSyncExternalStore(subscribeToColorScheme, () => window.matchMedia(colorQuery).matches, () => false);
  const dark = mode === "dark" || (mode === "system" && systemDark);
  const nextMode = dark ? "light" : "dark";
  const accent = config.theme.accent?.trim();
  // Keep custom accents legible against the light and dark design surfaces.
  const customAccent = accent && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(accent)
    ? { "--accent-override": `color-mix(in srgb, ${accent} 23%, var(--ink))` } as CSSProperties
    : undefined;
  const Design = designs[config.design];
  const sections = portfolioSections(config);
  const toggle = <button className="p-theme inline-flex items-center justify-center" type="button"
    aria-label={`Switch to ${nextMode} mode`} onClick={() => setMode(nextMode)}>
    {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
  </button>;
  return <div className="portfolio" id="portfolio" data-design={config.design} data-mode={mode}
    data-density={config.layout.density} data-accent={accent && accentTokens.includes(accent) ? accent : undefined} style={customAccent}>
    <a className="p-skip" href={`#${sections[0]?.id ?? "portfolio-main"}`}>Skip to content</a>
    <Design profile={config.profile} sections={sections} toggle={toggle} siteUrl={config.seo?.siteUrl} />
  </div>;
}
