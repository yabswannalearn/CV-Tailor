"use client";

import Image from "next/image";
import { Expand, Monitor, Smartphone, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PORTFOLIO_DESIGNS, PORTFOLIO_PREVIEW_SIZES, type PortfolioDesign } from "../lib/portfolioDesigns";
import CopyButton from "./copy-button";

const views = [
  { id: "desktop", name: "Desktop", icon: Monitor },
  { id: "mobile", name: "Mobile", icon: Smartphone },
] as const;

function promptFor({ id, name }: PortfolioDesign) {
  return `Use CV Tailor's cv-portfolio skill with the ${name} Portfolio Design (design: ${id}). Remember this in my workspace preferences (portfolio_preference) unless I ask to change it later. Ask me which frontend stack I prefer (defaulting to Next.js static export, with Vite + React or other options explained with trade-offs), review what profile details should stay private, scaffold my portfolio outside the CV Tailor repo, verify the local build, and generate the deploy-wizard.mjs script for Vercel or Cloudflare Pages.`;
}

export default function PortfolioGallery() {
  const [selected, setSelected] = useState<PortfolioDesign | null>(null);
  const [view, setView] = useState<(typeof views)[number]>(views[0]);
  const previewSize = PORTFOLIO_PREVIEW_SIZES[view.id];
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selected && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [selected]);

  function preview(design: PortfolioDesign, trigger: HTMLButtonElement) {
    opener.current = trigger;
    setView(views[0]);
    setSelected(design);
  }

  function closePreview() {
    setSelected(null);
    opener.current?.focus();
  }

  return (
    <section id="portfolio-designs" className="portfolio-gallery section" aria-labelledby="portfolio-designs-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{PORTFOLIO_DESIGNS.length} PORTFOLIO DESIGNS</span>
          <h2 id="portfolio-designs-title">Launch your portfolio.</h2>
        </div>
        <p>Preview each design with the same profile, then copy a prompt to build your own with cv-portfolio.</p>
      </div>
      <div className="portfolio-gallery-grid">
        {PORTFOLIO_DESIGNS.map(design => (
          <article className="portfolio-gallery-card" key={design.id}>
            <div className="portfolio-gallery-image">
              <Image src={`/portfolio-designs/${design.id}-desktop.png`} {...PORTFOLIO_PREVIEW_SIZES.desktop}
                alt={`Reinael Yabut’s portfolio in the ${design.name} design`} />
            </div>
            <div className="portfolio-card-body">
              <h3>{design.name}</h3>
              <p>{design.bestFor}</p>
              <div className="portfolio-card-actions">
                <button className="portfolio-preview-button" type="button" aria-label={`Preview ${design.name}`}
                  onClick={event => preview(design, event.currentTarget)}><Expand size={14} aria-hidden="true" />Preview</button>
                <CopyButton label={`Copy ${design.name} portfolio prompt`} caption="Copy prompt" text={promptFor(design)} />
              </div>
            </div>
          </article>
        ))}
      </div>
      <dialog ref={dialog} className="portfolio-preview-dialog" aria-labelledby="portfolio-preview-title"
        onClose={closePreview} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        {selected && <div className="portfolio-preview-content">
          <header>
            <div>
              <h3 id="portfolio-preview-title">{selected.name}</h3>
              <p>{selected.tagline}</p>
            </div>
            <button type="button" aria-label="Close portfolio preview" onClick={() => dialog.current?.close()}><X size={20} /></button>
          </header>
          <div className="portfolio-preview-controls" role="group" aria-label="Preview viewport">
            {views.map(option => (
              <button key={option.id} type="button" aria-pressed={view.id === option.id} onClick={() => setView(option)}>
                <option.icon size={15} aria-hidden="true" />{option.name}
              </button>
            ))}
          </div>
          <div className="portfolio-preview-stage" tabIndex={0} role="region" aria-label="Portfolio preview image">
            <Image key={view.id} src={`/portfolio-designs/${selected.id}-${view.id}.png`} {...previewSize}
              style={{ maxWidth: previewSize.width }} alt={`${selected.name} ${view.name.toLowerCase()} portfolio preview`} loading="eager" />
          </div>
          <footer><CopyButton label={`Copy ${selected.name} portfolio prompt`} caption="Copy prompt" text={promptFor(selected)} /></footer>
        </div>}
      </dialog>
    </section>
  );
}
