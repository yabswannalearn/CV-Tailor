# Portfolio

Use Node.js 22.12 or later. Install dependencies with `npm install`, preview with `npm run dev`, and export with `npm run build`.

## Project structure

The codebase separates concerns so it stays easy to maintain and extend:

- `src/data/` — Typed `PortfolioConfig` contract and your public content (`portfolio.config.ts`).
- `src/lib/` — Pure helpers for link validation, SEO metadata, impact metric formatting, and section selectors.
- `src/components/` — Reusable UI primitives (navigation, reading progress, filterable projects, experience ledger, contact bar).
- `src/designs/` — All six Portfolio Designs (`editorial`, `bento`, `technical`, `case-study`, `executive`, `bold-studio`).
- `src/custom/` — Place custom components or overrides here so future profile re-syncs only patch `src/data/portfolio.config.ts`.

Edit `src/data/portfolio.config.ts` to change your public content, section order, color mode, accent (`cobalt`, `plum`, `pine`, `ember`, or a hex color), or active Portfolio Design.

Add optional links under `profile.actions` and confirmed numbers or outcomes under `profile.metrics`. Set `seo.title` and `seo.description` for search and social previews, or use the defaults drawn from your approved profile. When you know the final public URL, set `seo.siteUrl` and rebuild to publish the canonical URL and sitemap. Use `seo.imagePath` and `seo.imageAlt` for an approved share image.

Put approved images and PDFs in `public/` and reference them with paths like `/projects/demo.png`. Static builds publish files in `public/` even when you leave them unlinked. Keep private material outside the project. Review your exported site before publishing.

When you are ready to publish, run `node deploy-wizard.mjs` in your terminal and complete the hosting login there. The wizard can also help connect a custom domain. The static build is in `out/` for Next.js or `dist/` for Vite.

The starter code carries the CV Tailor MIT notice in `LICENSE.cv-tailor`.
