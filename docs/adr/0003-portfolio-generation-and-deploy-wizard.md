# Portfolio generation uses static export, shared design modules, and a user-executed Deploy Wizard

Accepted 2026-11-24.

CV Tailor generates standalone web portfolios outside the CV Tailor repository via the `cv-portfolio` skill, keeping Node.js optional for core CLI users. Built-in starters default to Next.js static export (`output: "export"`) with Vite + React as a first-class alternative; both share one React + TypeScript + Tailwind layer implementing all six **Portfolio Designs** (`editorial`, `bento`, `technical`, `case-study`, `executive`, `bold-studio`) driven by a single **Portfolio Config**. Hosting login, deployment (Vercel or Cloudflare Pages), and optional custom domain DNS checks are delegated to a zero-dependency Node.js **Deploy Wizard** (`deploy-wizard.mjs`) written by the agent and executed locally by the user.

## Considered options

**Server-rendered Next.js with host adapters** (e.g., `@opennextjs/cloudflare` for Cloudflare Workers/Pages) was rejected as the default because personal portfolios are content sites that do not need server rendering. Static export produces one portable output (`out/` or `dist/`) that deploys identically to Vercel, Cloudflare Pages, and GitHub Pages at zero cost without adapter lag.

**Six separate starter repositories (or twelve per-framework templates)** was rejected because duplicating build tooling, dependencies, and layout fixes across repositories causes rapid drift and makes design switching destructive. Bundling all six lightweight designs behind one **Portfolio Config** lets users switch designs in one config edit and re-sync profile updates without overwriting custom overrides. Non-React stacks (Astro, SvelteKit, plain HTML/CSS) remain supported by agent scaffolding from the shared design specification and tokens, with the explicit trade-off that six-in-one instant switching is pre-bundled only for Next.js and Vite + React.

**Agent-executed deployment or Bash wizard scripts** were rejected for security and portability. Running provider CLIs or collecting hosting tokens in chat violates CV Tailor's local credential boundary, and Bash scripts break on native Windows shells. A zero-dependency Node.js `.mjs` wizard runs natively on Windows, macOS, and Linux, stays portable if the user moves the portfolio repository away from CV Tailor, and keeps credentials exclusively in interactive local logins.

## Consequences

- Switching a **Portfolio Design** or re-syncing profile facts in Next.js or Vite + React targets **Portfolio Config** rather than regenerating the entire project, preserving custom user files.
- Workspace preferences in SQLite store an optional nonsecret `portfolio_preference` (`design`, `stack`, `deploy_provider`, `project_dir`) alongside `resume_template`, while the deployed public URL lives on `Profile.portfolio` only after explicit user confirmation.
- Landing-page previews in `landing/` are rendered directly from the real starter designs populated with `landing/content/reinael-resume.json`, ensuring homepage previews stay faithful to what `cv-portfolio` scaffolds.
