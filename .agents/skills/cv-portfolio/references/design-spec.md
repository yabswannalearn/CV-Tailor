# Portfolio Designs

Use the selected design's desktop composition, then turn its columns into a single reading order on small screens. Start with the Portfolio Config [type](../assets/shared/src/data/types.ts) for content and layout choices. Keep codebases scalable and maintainable using KISS, DRY, YAGNI, and Separation of Concerns: data in `src/data/`, pure helpers in `src/lib/`, reusable UI primitives in `src/components/`, and visual layouts in `src/designs/`. Follow configured section order and visibility, skip empty sections and absent media, and preserve readable static HTML with JavaScript disabled.

## Layout and type

| Design | Structure | Type and spacing |
| --- | --- | --- |
| `editorial` · Editorial Minimal | Translucent sticky nav with live scroll-spy above an editorial masthead, framed KPI strip, and calm single-column sections with left-accent experience rows. | `Cormorant Garamond` display (with italic role headline) + `Plus Jakarta Sans` body. 46rem reading measure, warm paper palette. |
| `bento` · Bento Grid | Asymmetric 2.2:1 Bento hero with status/navigation side card, full-width KPI proof tiles, weighted 7:5 project bento cards with topic filters, and timeline experience cards. | `Bricolage Grotesque` display + `Plus Jakarta Sans` body + `JetBrains Mono` tags. Crisp alabaster/graphite surfaces with cobalt accent (no generic purple gradients). |
| `technical` · Technical / Engineer | Sticky ordered left index rail (`01`–`07`) with scroll-spy indicator beside a hairline-ruled engineering dossier and two-column project specification rows. | `Space Grotesk` headings + `IBM Plex Sans` body + `JetBrains Mono` nav, dates, and tags. Square corners and visible 1px rules. |
| `case-study` · Case Study | Split editorial hero band with framed KPI cards along the base, leading into filterable two-column case study cards with top accent rules and emphasized numeric outcomes. | `Newsreader` display (italic role accent) + `Plus Jakarta Sans` body. Generous whitespace and warm kiln-terracotta hierarchy. |
| `executive` · Executive / Classic | Framed dossier masthead with two-zone name/role header, structured KPI strip, sticky section nav, and two-column experience ledger with print stylesheet. | `Libre Baskerville` headings + `Plus Jakarta Sans` body. Calm stone/maritime-teal restraint; print layout omits navigation and action buttons. |
| `bold-studio` · Bold Studio | Oversized tight-tracked uppercase display hero with vermilion period accent, mono caption bar, and full-width numbered project showcase rows with hover shift. | `Syne` display + `Plus Jakarta Sans` body + `JetBrains Mono` eyebrows and numbered markers. High-contrast monochrome with a single international vermilion accent. |

## Color tokens

Each group is canvas / surface / ink / accent / rule, in light and dark mode respectively. Follow the configured `colorMode`, support `system`, and expose a keyboard-accessible light/dark toggle. Use `tabular-nums` for KPIs and dates, emphasize real numeric outcomes subtly without inventing text, and provide one-click email copy when email is approved.

| Design | Light | Dark |
| --- | --- | --- |
| Editorial | `#f6f4ee / #fcfbf7 / #181c19 / #1f513f / #d3d8ce` | `#121714 / #1a211d / #eef1ea / #8ecba8 / #2f3b33` |
| Bento | `#f2f3f5 / #ffffff / #111827 / #1d4ed8 / #d8dee8` | `#0c0f14 / #141922 / #f1f5f9 / #7ba6ff / #273244` |
| Technical | `#f2f5f7 / #ffffff / #0f172a / #0369a1 / #cbd5e1` | `#0a1016 / #101821 / #e6edf3 / #58c4dc / #243342` |
| Case Study | `#f8f3ec / #fffdf9 / #241a15 / #a43d28 / #dcc8b7` | `#171210 / #221b18 / #f5ebe2 / #ea8a72 / #4a3730` |
| Executive | `#eef1ed / #fcfdfb / #1a2526 / #1e4e5a / #c6d0cc` | `#111718 / #182022 / #e9efef / #85c1ce / #2f4043` |
| Bold Studio | `#f5f2eb / #ebe6dc / #111111 / #d63b17 / #ccc5b8` | `#0d0d0d / #171717 / #f4f1ea / #ff5c35 / #2b2b2b` |

Use responsive gutters of about 1.2–4.25rem and section spacing of 2.75–5.25rem. Let compact density reduce spacing without changing section order. Use one `h1`, labeled sections, visible focus, a skip-to-content link, translucent sticky chrome with `prefers-reduced-transparency` fallback, and `prefers-reduced-motion` support. Test at 390px with long titles and absent optional sections.
