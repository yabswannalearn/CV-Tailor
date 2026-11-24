# Portfolio stack choices

| Stack | Choose it for | Static output and design switching |
| --- | --- | --- |
| `nextjs` (default) | React with an App Router entry point and metadata in the static HTML | `npm run build` produces `out/`. All six Portfolio Designs switch through Portfolio Config. Keep server-only APIs out of a static export. |
| `vite-react` | A small React setup and fast local iteration | `npm run build` prerenders the portfolio and its metadata to `dist/`. All six designs use the same components as Next.js. The browser adds interactivity after the static page has loaded. |
| `astro` | Static HTML with optional interactive components | Build to `dist/` with static output. Implement the chosen design with Astro components and use a small script for the color toggle. |
| `sveltekit` | A user who already works in Svelte | Use `@sveltejs/adapter-static` and prerender routes. Check the actual export setting before configuring the Deploy Wizard. |
| `html` | A small site with minimal tooling and manual control | Keep public HTML, CSS and assets under a dedicated `site/` directory. A short local script can apply the Portfolio Config data when needed. |
| `custom` | An existing stack the user wants to keep | Agree on its static build command, output directory, config source and preview command. |

For Astro, SvelteKit, HTML and custom projects, agree which design to implement before scaffolding. Give the user an explicit path to switch designs by applying [the design specification](design-spec.md). The built-in two React starters bundle instant switching across all six.
