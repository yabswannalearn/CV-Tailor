import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sharedSrc = join(root, ".agents", "skills", "cv-portfolio", "assets", "shared", "src");
const landing = join(root, "landing");
const previewDest = join(landing, "src", "lib", "portfolio-preview");
const checkOnly = process.argv.includes("--check");

const designs = [
  {
    id: "editorial",
    name: "Editorial Minimal",
    tagline: "Cormorant serif display, warm paper restraint, and scroll-spy navigation put the writing first.",
    bestFor: "Writers, design engineers and generalists",
    first: "about",
    defaultMode: "light",
  },
  {
    id: "bento",
    name: "Bento Grid",
    tagline: "An asymmetric Swiss Bento layout surfaces KPIs, filterable projects, and experience at a glance.",
    bestFor: "Product builders and designers",
    first: "projects",
    defaultMode: "light",
  },
  {
    id: "technical",
    name: "Technical / Engineer",
    tagline: "A sticky numbered index rail and hairline spec sheets make architecture and outcomes easy to scan.",
    bestFor: "Software, systems and AI engineers",
    first: "projects",
    defaultMode: "dark",
  },
  {
    id: "case-study",
    name: "Case Study",
    tagline: "A split editorial masthead and structured project briefs highlight roles, constraints and measurable impact.",
    bestFor: "Product, UX and consulting",
    first: "projects",
    defaultMode: "light",
  },
  {
    id: "executive",
    name: "Executive / Classic",
    tagline: "A formal dossier masthead and structured experience ledger carry cleanly from screen to print.",
    bestFor: "Operations and leadership",
    first: "experience",
    defaultMode: "light",
  },
  {
    id: "bold-studio",
    name: "Bold Studio",
    tagline: "Oversized monochrome display type and a sharp vermilion accent frame a numbered work showcase.",
    bestFor: "Creatives and independent makers",
    first: "projects",
    defaultMode: "dark",
  },
];

const viewports = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
};

// Public highlights and actions from the portfolio Reinael supplied for this showcase.
const showcaseHighlights = {
  availability: "Open to Full Stack & AI Automation roles",
  location: "Remote · Philippines",
  actions: [
    { label: "Explore selected work", href: "#projects" },
    { label: "Get in touch", href: "#contact" },
  ],
  metrics: [
    { value: "3+", label: "Years of experience", href: "#experience" },
    { value: "20", label: "Projects", href: "https://www.reinaelyabut.dev/projects" },
    { value: "23", label: "Credentials", href: "https://www.reinaelyabut.dev/#certs" },
  ],
};

function inferProjectTags(project) {
  const haystack = [project.name, ...(project.bullets ?? [])].join(" ").toLowerCase();
  const catalog = [
    ["AI Automation", /\b(ai|llm|rag|n8n|gemini|automation|agent)\b/],
    ["Full Stack", /\b(full-stack|next\.js|react|fastapi|supabase|postgresql|platform)\b/],
    ["Python", /\b(python|fastapi|pytorch)\b/],
    ["TypeScript", /\b(next\.js|react|typescript)\b/],
  ];
  return catalog.filter(([, pattern]) => pattern.test(haystack)).map(([label]) => label);
}

function portfolioFromResume({ profile, content }, { id, first, defaultMode }) {
  const order = ["about", "experience", "projects", "skills", "education", "certifications", "contact"];
  const confirmedSkills = (profile.skills ?? []).filter((skill) => skill.is_confirmed === true);
  return {
    design: id,
    theme: { colorMode: defaultMode },
    layout: { sectionOrder: [first, ...order.filter((section) => section !== first)] },
    profile: {
      fullName: [profile.first_name, profile.last_name].join(" "),
      headline: content.experience[0].title,
      summary: content.summary,
      ...showcaseHighlights,
      links: {
        linkedin: profile.linkedin,
        github: profile.github,
        website: profile.portfolio,
      },
    },
    experience: content.experience.map(({ title, company, location, date, bullets }) => ({
      jobTitle: title,
      company,
      location,
      dateRange: date,
      highlights: bullets,
    })),
    projects: content.projects.map((project) => ({
      name: project.name,
      dateRange: project.date,
      description: project.bullets[0] ?? "",
      highlights: project.bullets.slice(1),
      tags: inferProjectTags(project),
    })),
    skills: confirmedSkills.length
      ? [{ category: "Core stack", items: confirmedSkills.map((skill) => skill.skill_name) }]
      : [],
    education: profile.education.map(({ school_name, course, location, date_range, description }) => ({
      schoolName: school_name,
      course,
      location,
      dateRange: date_range,
      description,
    })),
    certifications: content.certifications
      .split("|")
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ name })),
  };
}

async function listFiles(directory, base = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full, base)));
    } else if (entry.name !== "portfolio.css") {
      files.push(relative(base, full).replace(/\\/g, "/"));
    }
  }
  return files.sort();
}

async function main() {
  const resume = JSON.parse(await readFile(join(landing, "content", "reinael-resume.json"), "utf8"));
  const metadata = designs.map(({ id, name, tagline, bestFor }) => ({ id, name, tagline, bestFor }));
  const configs = Object.fromEntries(designs.map((design) => [design.id, portfolioFromResume(resume, design)]));

  const generatedModule = [
    "// Generated by scripts/build_portfolio_gallery.mjs.",
    'import type { PortfolioConfig, PortfolioDesignId } from "./portfolio-preview/data/types";',
    "",
    `export const PORTFOLIO_DESIGNS = ${JSON.stringify(metadata, null, 2)} as const;`,
    "",
    `export const PORTFOLIO_PREVIEW_SIZES = ${JSON.stringify(viewports, null, 2)} as const;`,
    "",
    `export const PORTFOLIO_PREVIEW_CONFIGS: Record<PortfolioDesignId, PortfolioConfig> = ${JSON.stringify(configs, null, 2)};`,
    "",
    "export type PortfolioDesign = (typeof PORTFOLIO_DESIGNS)[number];",
    "",
  ].join("\n");

  const expectedFiles = await listFiles(sharedSrc);
  const designsFile = join(landing, "src", "lib", "portfolioDesigns.ts");

  if (checkOnly) {
    const mismatches = [];
    const currentModule = await readFile(designsFile, "utf8").catch(() => "");
    if (currentModule !== generatedModule) mismatches.push("landing/src/lib/portfolioDesigns.ts");
    const actualFiles = await listFiles(previewDest).catch(() => []);
    if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
      mismatches.push("landing/src/lib/portfolio-preview/ (file list differs)");
    } else {
      for (const file of expectedFiles) {
        const [a, b] = await Promise.all([
          readFile(join(sharedSrc, file), "utf8"),
          readFile(join(previewDest, file), "utf8"),
        ]);
        if (a !== b) mismatches.push(`landing/src/lib/portfolio-preview/${file}`);
      }
    }
    if (mismatches.length) {
      throw new Error(`Run node scripts/build_portfolio_gallery.mjs. Out of sync:\n- ${mismatches.join("\n- ")}`);
    }
    console.log("Portfolio gallery preview sources are synchronized.");
    return;
  }

  await rm(previewDest, { recursive: true, force: true });
  await mkdir(previewDest, { recursive: true });
  await cp(sharedSrc, previewDest, {
    recursive: true,
    filter: (source) => !source.endsWith("portfolio.css"),
  });
  await writeFile(designsFile, generatedModule, "utf8");
  await rm(join(landing, "public", "portfolio-designs"), { recursive: true, force: true });
  console.log(`Synced ${expectedFiles.length} shared preview files and ${designs.length} live Portfolio Design configs.`);
}

await main();
