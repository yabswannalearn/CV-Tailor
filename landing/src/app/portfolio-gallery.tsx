"use client";

import { ArrowUpRight, Expand, Monitor, Smartphone, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PORTFOLIO_DESIGNS, PORTFOLIO_PREVIEW_SIZES, type PortfolioDesign } from "../lib/portfolioDesigns";
import CopyButton from "./copy-button";

const views = [
  { id: "desktop", name: "Desktop", icon: Monitor },
  { id: "mobile", name: "Mobile", icon: Smartphone },
] as const;

function promptFor({ id, name }: PortfolioDesign) {
  return `Use CV Tailor's cv-portfolio skill with the ${name} Portfolio Design (design: ${id}). Remember this in my workspace preferences (portfolio_preference) unless I ask to change it later. Ask me where to place the portfolio directory and which frontend stack I prefer (defaulting to Next.js static export, with Vite + React or other options explained with trade-offs), review what profile details should stay private, scaffold my portfolio outside the CV Tailor repo, verify the local build, and generate the deploy-wizard.mjs script for Vercel or Cloudflare Pages.`;
}

function LiveCardPreview({ design, onOpen }: { design: PortfolioDesign; onOpen: (trigger: HTMLButtonElement) => void }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.28);
  const desktop = PORTFOLIO_PREVIEW_SIZES.desktop;

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const update = () => {
      const width = node.clientWidth;
      if (width > 0) setScale(width / desktop.width);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [desktop.width]);

  return (
    <button
      type="button"
      className="portfolio-live-trigger"
      aria-label={`Open live ${design.name} preview`}
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <div className="portfolio-live-chrome" aria-hidden="true">
        <span className="portfolio-live-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="portfolio-live-url">reinaelyabut.dev</span>
        <span className="portfolio-live-badge">Live</span>
      </div>
      <div className="portfolio-live-viewport" ref={frameRef}>
        <iframe
          className="portfolio-live-iframe"
          src={`/portfolio-designs/${design.id}/`}
          title={`Live ${design.name} portfolio thumbnail`}
          loading="lazy"
          tabIndex={-1}
          style={{
            width: desktop.width,
            height: desktop.height,
            transform: `scale(${scale})`,
          }}
        />
      </div>
    </button>
  );
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
        <p>Explore live interactive previews built from the same profile, then copy a prompt to generate yours with cv-portfolio.</p>
      </div>
      <div className="portfolio-gallery-grid">
        {PORTFOLIO_DESIGNS.map((design) => (
          <article className="portfolio-gallery-card" key={design.id}>
            <LiveCardPreview design={design} onOpen={(trigger) => preview(design, trigger)} />
            <div className="portfolio-card-body">
              <h3>{design.name}</h3>
              <p>{design.bestFor}</p>
              <div className="portfolio-card-actions">
                <button
                  className="portfolio-preview-button"
                  type="button"
                  aria-label={`Preview ${design.name}`}
                  onClick={(event) => preview(design, event.currentTarget)}
                >
                  <Expand size={14} aria-hidden="true" />
                  Live preview
                </button>
                <CopyButton
                  label={`Copy ${design.name} portfolio prompt`}
                  caption="Copy prompt"
                  text={promptFor(design)}
                />
              </div>
            </div>
          </article>
        ))}
      </div>
      <dialog
        ref={dialog}
        className="portfolio-preview-dialog"
        aria-labelledby="portfolio-preview-title"
        onClose={closePreview}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        {selected && (
          <div className="portfolio-preview-content">
            <header>
              <div>
                <h3 id="portfolio-preview-title">{selected.name}</h3>
                <p>{selected.tagline}</p>
              </div>
              <button type="button" aria-label="Close portfolio preview" onClick={() => dialog.current?.close()}>
                <X size={20} />
              </button>
            </header>
            <div className="portfolio-preview-toolbar">
              <div className="portfolio-preview-controls" role="group" aria-label="Preview viewport">
                {views.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={view.id === option.id}
                    onClick={() => setView(option)}
                  >
                    <option.icon size={15} aria-hidden="true" />
                    {option.name}
                  </button>
                ))}
              </div>
              <a
                className="portfolio-open-full"
                href={`/portfolio-designs/${selected.id}/`}
                target="_blank"
                rel="noreferrer"
              >
                Open full page
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </div>
            <div
              className="portfolio-preview-stage"
              data-viewport={view.id}
              tabIndex={0}
              role="region"
              aria-label={`Interactive ${selected.name} ${view.name.toLowerCase()} preview`}
            >
              <iframe
                key={`${selected.id}-${view.id}`}
                className="portfolio-stage-iframe"
                src={`/portfolio-designs/${selected.id}/`}
                title={`${selected.name} ${view.name.toLowerCase()} live portfolio preview`}
                style={{
                  width: view.id === "mobile" ? previewSize.width : "100%",
                  maxWidth: view.id === "mobile" ? previewSize.width : previewSize.width,
                  height: view.id === "mobile" ? 720 : "100%",
                }}
              />
            </div>
            <footer>
              <span className="portfolio-preview-hint">Scroll, switch themes, and filter projects live inside the preview.</span>
              <CopyButton
                label={`Copy ${selected.name} portfolio prompt`}
                caption="Copy prompt"
                text={promptFor(selected)}
              />
            </footer>
          </div>
        )}
      </dialog>
    </section>
  );
}
