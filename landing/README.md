# Landing page

All eight gallery formats and the CV Studio preview use Reinael Yabut's supplied resume. The source content in `content/reinael-resume.json` is independent of the saved career profile and retains the dates and claims from the provided `Reinael_Yabut CV.pdf`.

Regenerate the shared landing-page and dashboard gallery assets from the repository root:

```powershell
.venv/Scripts/python.exe -X utf8 scripts/build_resume_gallery.py
```

Use the installed CV Tailor Python environment, Tectonic, and Poppler (`pdftoppm` and `pdftotext`). The script uses the real templates, fits the complete typeset resume to one page, and checks every bullet, skills row, and certification before rendering its PNG. Each format's PDF and PNG in both apps' `public/resume-templates/` directories must ship together.

Build and check with `npm --prefix landing run build`, `npm --prefix landing run lint`, and `npm --prefix landing run test:browser`.

The user-supplied one-minute explainer is served from `public/videos/cv-tailor-explainer.mp4` in the section after the agent carousel. Its poster is a frame from that video. The player uses native controls and loads the video when the visitor chooses to play it.

## Search visibility

The canonical public origin is `https://www.cvtailor.me`, matching the apex domain's redirect. Shared titles, social metadata, and software structured data live in `src/lib/site.ts`. Keep the Google verification tag in `src/app/layout.tsx` after ownership is verified.

The three static guides in `src/lib/guides.ts` have their own canonical URLs, descriptions, breadcrumbs, and related links. Adding a guide updates `/sitemap.xml`; also add a useful link from the homepage. Keep product claims grounded in the CLI, skills, and documentation. The public site describes local software; it does not host the user's career workspace.

`public/robots.txt` allows crawling of the public site and advertises the sitemap. `/opengraph-image.png` renders a share image at build time without a runtime server or external font fetch. Visible FAQs answer product questions; they do not claim eligibility for a Google FAQ rich result. Google does not require `llms.txt` for AI search visibility; see its [AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).

The browser suite checks exported pages without JavaScript, unique canonicals, structured data, crawl files, share-image dimensions, and mobile layouts. After deploying, verify the property in Google Search Console, submit `https://www.cvtailor.me/sitemap.xml`, and inspect the four public URLs. Track impressions, clicks, search queries, and indexed pages there. Bing Webmaster Tools can additionally report AI citations; it requires a separate verified property.
