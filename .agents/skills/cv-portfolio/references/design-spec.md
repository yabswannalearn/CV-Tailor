# Portfolio Designs

Use the selected design's desktop composition, then turn its columns into a single reading order on small screens. Start with the Portfolio Config [type](../assets/shared/src/data/types.ts) for content and layout choices. Follow configured section order and visibility. Skip empty sections and absent media. Keep identity and the confirmed headline in the introduction, and surface approved links in Contact.

## Layout and type

| Design | Structure | Type and spacing |
| --- | --- | --- |
| `editorial` · Editorial Minimal | Sticky minimal nav above a name-led masthead. Sections read down one column with fine horizontal rules. | Palatino or Georgia for display, system sans for body. Use a 43rem reading measure and generous masthead spacing. |
| `bento` · Bento Grid | An asymmetric introduction and navigation row, then offset project tiles and stacked experience cards. | Trebuchet or system sans for display, system sans for body. Start with a 2:1 header, a 1.2:1 project grid, 1rem gaps and 1.4rem card corners. Use an availability or location tile when those facts exist. |
| `technical` · Technical / Engineer | Sticky ordered section index beside a ruled content grid. Give projects a heading/metadata column and a body column. | System sans for headings, ui-monospace or Consolas for dates, tags and navigation. Use square corners, visible 1px rules, and a compact nav. |
| `case-study` · Case Study | Split masthead with a banded background. Lead with projects when the config allows, placing role and dates in one column and the narrative in the other. | Charter, Cambria or Georgia for display, system sans for body. Use broad project cards with a top rule and calmer entry spacing below. |
| `executive` · Executive / Classic | Border-led, two-zone name and role header, then section titles in a left column with the records at right. | Segoe UI or system sans for the name, Georgia for section titles. Keep lines restrained and include a light print layout with navigational controls omitted. |
| `bold-studio` · Bold Studio | Oversized typographic hero above numbered showcase rows. Projects lead when specified in the config. | Arial Black or a heavy system sans for the name, monospace for navigation and captions. Use tight headline tracking and full-width rules. |

## Color tokens

Each group is canvas / surface / ink / accent / rule, in light and dark mode respectively. Follow the configured `colorMode`, support `system`, and expose a keyboard-accessible light/dark toggle. Use the configurable accent on focus indicators and interactive text. Check contrast after applying an override.

| Design | Light | Dark |
| --- | --- | --- |
| Editorial | `#f3f5ee / #fbfcf7 / #222e25 / #38624c / #b8c5b6` | `#1a221c / #232e25 / #edf2e6 / #a5cbb0 / #485a4a` |
| Bento | `#eceefa / #fafaff / #222446 / #55409b / #cdd2ec` | `#191931 / #242440 / #eeeefe / #cabdff / #444567` |
| Technical | `#eaf0f1 / #f8fbfc / #202e37 / #166285 / #bacbd2` | `#101b23 / #172832 / #e0edf4 / #91d9f5 / #39515f` |
| Case Study | `#fbf2e8 / #fffaf3 / #34231f / #953f31 / #dbc0ae` | `#271f1d / #322825 / #fae9df / #ffb8a3 / #644a40` |
| Executive | `#edf0eb / #fcfcf7 / #233335 / #31585f / #bcc9c3` | `#172123 / #222d2f / #eaf1ed / #a8cbd0 / #485c5b` |
| Bold Studio | `#fff6dd / #ffe9ad / #2d2120 / #8b321b / #ad874f` | `#241b35 / #372749 / #fff3d6 / #ffd476 / #806794` |

Use responsive gutters of about 1–4rem and section spacing of 2.5–5rem. Let compact density reduce the spacing without changing section order. Use one `h1`, labeled sections, visible focus and a skip-to-content link. Respect reduced motion and test at 390px with long titles and absent optional sections.
