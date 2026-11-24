---
name: cv-portfolio
description: Generate a public web portfolio from confirmed CV Tailor profile facts, switch Portfolio Designs, re-sync content, or prepare the local Deploy Wizard.
---

# cv-portfolio

## Load the workspace

Run `cv-tailor --json status`, `cv-tailor --json preferences get`, and `cv-tailor --json profile get`. Keep the same `--data-dir` on every command when the workspace uses one. Use the CLI for all workspace reads and writes. If the profile is missing, use `cv-profile` to import and confirm its facts first.

## Confirm the project choices

Read the saved `portfolio_preference`. State its `design`, `stack`, `deploy_provider`, and `project_dir`, then reuse the supplied values unless the user changes them or starts another portfolio.

For a new choice, summarize [stack trade-offs](references/stack-tradeoffs.md) and confirm the stack. Next.js static export is the default and Vite + React is the lighter built-in option. Astro, SvelteKit, HTML and custom stacks use [the design specification](references/design-spec.md) and need their own implementation. Confirm one Portfolio Design from that specification (`editorial`, `bento`, `technical`, `case-study`, `executive`, `bold-studio`). A previously specified choice counts as confirmation.

For a new portfolio, choose a new absolute local directory outside the CV Tailor checkout, such as `~/cv-tailor-portfolio` resolved to an absolute path. Check the resolved location before writing, including symlink targets. An existing project uses its current Portfolio Config.

## Review public content before writing it

1. Use confirmed profile facts and facts the user explicitly supplies for this portfolio. Show proposed public content. List skills with `is_confirmed` other than `true` and ask which to confirm or skip. Omit those skills until confirmed and leave `mobile_no` out by default.
2. Ask separately before adding a public email link or a downloadable resume PDF. If the PDF contains phone numbers or private contact details, say that a public PDF exposes them and ask for an approved redacted PDF or omit it. Only include a phone number if the user explicitly approves publishing it. Put approved assets in `public/` after review. Treat Portfolio Config, the output of the build, and every file in `public/` as public material. Use section visibility for layout and remove private values entirely.
3. Ask for a confirmed headline and any missing details the user wants to show, such as a bio, project URLs or screenshots, availability, section order and visibility, and color mode. Omit absent optional fields. Use the user's exact facts for taglines, metrics, testimonials, links and screenshots. Publish project images supplied or approved by the user.
4. If the user wants visual direction, invite them to share a screenshot, a link they can view, or a description of something they saw on [Pixlpin](https://pixlpin.com/). Work from the supplied reference and ask for a screenshot or description if it is inaccessible. Use typography, spacing, surface contrast and layout as cues for original MIT-compatible styling. Keep the user's own content, avoid collecting pages from Pixlpin, and leave third-party copy, logos and imagery out.

## Create or update the portfolio

Check for Node.js 22.12 or later before using the built-in starters or handing off the Deploy Wizard.

- **New Next.js or Vite + React project.** Write the reviewed public JSON using [the `PortfolioConfig` type](assets/shared/src/data/types.ts). From the CV Tailor checkout run `node .agents/skills/cv-portfolio/scripts/scaffold_portfolio.mjs <nextjs|vite-react> <absolute-new-directory> <public-config.json> [vercel|cloudflare]`. The optional provider sets the Deploy Wizard default. The generated site includes all six Portfolio Designs and `src/data/portfolio.config.ts`.
- **New Astro, SvelteKit, HTML or custom project.** Implement the chosen design using [the design specification](references/design-spec.md). Put the public facts in one Portfolio Config equivalent. Copy [the Deploy Wizard](assets/deploy-wizard.mjs) to the project root and set its `defaults` to the selected provider and relative static output directory. Plain HTML can use a dedicated `site/` output folder with `index.html`.
- **Design switch.** Edit `design` in the built-in project's `src/data/portfolio.config.ts`. Change `layout` or `theme` only when requested. For other stacks, apply the design specification to the existing implementation.
- **Profile re-sync.** Compare the current Portfolio Config with the updated profile. Show a concise diff of additions, removals and changed facts, then confirm the public fields and apply the reviewed edits to Portfolio Config only. Keep the chosen design, layout, color mode, approved media and custom files unless the user requested changes to them.

## Verify and remember the choice

In the portfolio directory, check Node.js and install dependencies when needed with `npm install`. Run `npm run build` for the built-in starters and check `out/index.html` (Next.js) or `dist/index.html` (Vite). Use the selected stack's equivalent check for other projects. Review the public output for unintended contact details and unconfirmed facts. Report the actual build result and the local preview command (`npm run dev` for the built-in starters).

Read the current preferences revision and save `portfolio_preference` with `cv-tailor --json preferences set --revision N --input <file-or-dash>`. Send only `portfolio_preference` containing the chosen `design`, `stack`, optional `deploy_provider`, and absolute `project_dir`. On a revision conflict, reload and reconcile changes. To clear a saved preference on request, send `{"portfolio_preference": null}` using the current revision.

## Hand off deployment

Give the user the project path and `node deploy-wizard.mjs` to run in their own terminal. The wizard guides Vercel or Cloudflare Pages setup, GitHub or direct CLI deployment, and optional custom-domain DNS checks. The user handles the wizard, logins, deployments and credentials locally. Keep hosting tokens out of chat, files written by the agent, and CV Tailor preferences.

If the user gives you the deployed URL and confirms saving it, reload the full current profile, change only `portfolio`, and use `cv-tailor --json profile set --revision N --input <file-or-dash>`. Read it back to confirm the saved URL.
