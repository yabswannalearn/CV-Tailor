# Portfolio

Use Node.js 22.12 or later. Install dependencies with `npm install`, preview with `npm run dev`, and export with `npm run build`.

Edit `src/data/portfolio.config.ts` to change your public content, section order, color mode or Portfolio Design. All six designs ship together. For an accent, use a hex color or `cobalt`, `plum`, `pine` or `ember`. Put custom components in `src/custom/` or elsewhere alongside the starter code. A profile re-sync updates Portfolio Config, so keep custom code in its own files.

Put approved images and PDFs in `public/` and reference them with paths like `/projects/demo.png`. Static builds publish files in `public/` even when you leave them unlinked. Keep private material outside the project. Review your exported site before publishing.

When you are ready to publish, run `node deploy-wizard.mjs` in your terminal and complete the hosting login there. The wizard can also help connect a custom domain. The static build is in `out/` for Next.js or `dist/` for Vite.

The starter code carries the CV Tailor MIT notice in `LICENSE.cv-tailor`.
