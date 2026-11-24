import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { scaffoldPortfolio, writePortfolioConfig } from "../.agents/skills/cv-portfolio/scripts/scaffold_portfolio.mjs";

const landing = resolve(import.meta.dirname, "../landing");
const require = createRequire(join(landing, "package.json"));
const { chromium } = require("@playwright/test");
const designs = [
  { id: "editorial", name: "Editorial Minimal", tagline: "Serif headlines and a generous reading column put the writing first.", bestFor: "Writers and generalists", first: "about" },
  { id: "bento", name: "Bento Grid", tagline: "An asymmetric grid brings projects and experience into view at a glance.", bestFor: "Product builders and designers", first: "projects" },
  { id: "technical", name: "Technical / Engineer", tagline: "A section index and structured project briefs make the work easy to scan.", bestFor: "Software, systems and AI engineers", first: "projects" },
  { id: "case-study", name: "Case Study", tagline: "Split project briefs give each role, contribution and outcome room to read.", bestFor: "Product, UX and consulting", first: "projects" },
  { id: "executive", name: "Executive / Classic", tagline: "A formal masthead and clear experience sections carry through to print.", bestFor: "Operations and leadership", first: "experience" },
  { id: "bold-studio", name: "Bold Studio", tagline: "Large display type leads into a numbered showcase of selected work.", bestFor: "Creatives and independent makers", first: "projects" },
];
const viewports = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } };

function portfolioFromResume({ profile, content }, { id, first }) {
  const order = ["about", "experience", "projects", "skills", "education", "certifications", "contact"];
  const confirmedSkills = (profile.skills ?? []).filter(skill => skill.is_confirmed === true);
  return {
    design: id,
    theme: { colorMode: id === "technical" || id === "bold-studio" ? "dark" : "light" },
    layout: { sectionOrder: [first, ...order.filter(section => section !== first)] },
    profile: {
      fullName: [profile.first_name, profile.last_name].join(" "),
      headline: content.experience[0].title,
      summary: content.summary,
      links: { linkedin: profile.linkedin, github: profile.github, website: profile.portfolio },
    },
    experience: content.experience.map(({ title, company, location, date, bullets }) => ({
      jobTitle: title, company, location, dateRange: date, highlights: bullets,
    })),
    projects: content.projects.map(({ name, date, bullets }) => ({
      name, dateRange: date, description: bullets[0] ?? "", highlights: bullets.slice(1),
    })),
    skills: confirmedSkills.length ? [{ items: confirmedSkills.map(skill => skill.skill_name) }] : [],
    education: profile.education.map(({ school_name, course, location, date_range, description }) => ({
      schoolName: school_name, course, location, dateRange: date_range, description,
    })),
    certifications: content.certifications.split("|").map(name => name.trim()).filter(Boolean).map(name => ({ name })),
  };
}

function npm(cwd, ...args) {
  const windows = process.platform === "win32";
  const command = windows ? "cmd.exe" : "npm";
  const parameters = windows ? ["/d", "/c", "npm", ...args] : args;
  const result = spawnSync(command, parameters, { cwd, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`npm ${args.join(" ")} failed. ${result.error?.message ?? `Exit code ${result.status}`}`);
}

function serveExport(directory) {
  const mime = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" };
  return createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = pathname === "/" ? "index.html" : /^\/assets\/[\w.-]+$/.test(pathname) ? pathname.slice(1) : null;
    try {
      if (!file) throw new Error("Unknown preview path");
      const bytes = await readFile(join(directory, file));
      response.writeHead(200, { "Content-Type": mime[extname(file)], "Cache-Control": "no-store" }).end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
}

async function capture(browser, origin, design, config, screenshots) {
  for (const [mode, viewport] of Object.entries(viewports)) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
    try {
      await page.route("**/*", route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
      await page.goto(origin, { waitUntil: "networkidle" });
      await page.locator(`[data-design="${design.id}"]`).getByRole("heading", { name: config.profile.fullName, level: 1 }).waitFor();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflow) throw new Error(`${design.id} overflows the ${mode} viewport.`);
      await page.screenshot({ path: join(screenshots, `${design.id}-${mode}.png`), animations: "disabled", scale: "css" });
    } finally {
      await page.close();
    }
  }
  console.log(`Captured ${design.id} at 1280×800 and 390×844.`);
}

async function main() {
  const resume = JSON.parse(await readFile(join(landing, "content", "reinael-resume.json"), "utf8"));
  const temp = await mkdtemp(join(tmpdir(), "cv-tailor-portfolio-gallery-"));
  let browser;
  let server;
  try {
    const project = await scaffoldPortfolio({ stack: "vite-react", target: join(temp, "portfolio"), config: portfolioFromResume(resume, designs[0]) });
    const screenshots = join(temp, "screenshots");
    await mkdir(screenshots);
    npm(project, "ci", "--prefer-offline", "--no-audit", "--no-fund");
    browser = await chromium.launch();
    server = serveExport(join(project, "dist"));
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const design of designs) {
      const config = portfolioFromResume(resume, design);
      await writePortfolioConfig(project, config);
      npm(project, "run", "build");
      await capture(browser, origin, design, config, screenshots);
    }

    const metadata = designs.map(({ id, name, tagline, bestFor }) => ({ id, name, tagline, bestFor }));
    await cp(screenshots, join(landing, "public", "portfolio-designs"), { recursive: true });
    await writeFile(join(landing, "src", "lib", "portfolioDesigns.ts"),
      `// Generated by scripts/build_portfolio_gallery.mjs.\nexport const PORTFOLIO_DESIGNS = ${JSON.stringify(metadata, null, 2)} as const;\n\nexport const PORTFOLIO_PREVIEW_SIZES = ${JSON.stringify(viewports, null, 2)} as const;\n\nexport type PortfolioDesign = (typeof PORTFOLIO_DESIGNS)[number];\n`, "utf8");
    console.log(`Generated ${designs.length * Object.keys(viewports).length} PNGs in landing/public/portfolio-designs.`);
  } finally {
    await browser?.close();
    if (server?.listening) await new Promise(resolveClose => server.close(resolveClose));
    await rm(temp, { recursive: true, force: true, maxRetries: 3 });
  }
}

await main();
