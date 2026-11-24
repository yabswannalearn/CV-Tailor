import { cp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const assets = resolve(import.meta.dirname, "../assets");
const stacks = ["nextjs", "vite-react"];
const designs = ["editorial", "bento", "technical", "case-study", "executive", "bold-studio"];
const providers = ["vercel", "cloudflare"];

async function physicalPath(path) {
  try {
    return await realpath(path);
  } catch (error) {
    if (error.code !== "ENOENT" || dirname(path) === path) throw error;
    return join(await physicalPath(dirname(path)), relative(dirname(path), path));
  }
}

export function writePortfolioConfig(project, config) {
  const text = `import type { PortfolioConfig } from "./types";\n\nexport const portfolioConfig: PortfolioConfig = ${JSON.stringify(config, null, 2)};\n`;
  return writeFile(join(project, "src", "data", "portfolio.config.ts"), text, "utf8");
}

export async function scaffoldPortfolio({ stack = "nextjs", target, config, provider = null }) {
  if (!stacks.includes(stack)) throw new Error("Choose nextjs or vite-react for the shared starter.");
  if (provider !== null && !providers.includes(provider)) throw new Error("Choose vercel or cloudflare as the saved hosting provider.");
  if (!designs.includes(config?.design) || !config.profile?.fullName?.trim() || !config.profile?.headline?.trim()) {
    throw new Error("Supply a reviewed public Portfolio Config JSON with a Portfolio Design, full name and headline.");
  }
  if (typeof target !== "string" || !isAbsolute(target) || (process.platform === "win32" && !/^[a-z]:[\\/]/i.test(target))) {
    throw new Error("Choose an absolute local path for a new portfolio directory.");
  }
  const repo = await realpath(resolve(import.meta.dirname, "../../../.."));
  const project = await physicalPath(resolve(target));
  if (project.startsWith("\\\\")) throw new Error("Choose a local portfolio directory outside network shares.");
  const fromRepo = relative(repo, project);
  if (!fromRepo || (!isAbsolute(fromRepo) && fromRepo !== ".." && !fromRepo.startsWith(`..${sep}`))) {
    throw new Error("Choose a directory outside the CV Tailor checkout.");
  }
  if ([target, project].some(path => path.split(/[\\/]/).some(part => part.toLowerCase().startsWith(".env")))) {
    throw new Error("Choose a portfolio path without environment-file segments.");
  }

  await mkdir(dirname(project), { recursive: true });
  try {
    await mkdir(project);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error("Choose a new directory for scaffolding. To update a portfolio, edit its existing Portfolio Config.");
  }
  try {
    await cp(join(assets, "shared"), project, { recursive: true });
    await cp(join(assets, stack), project, { recursive: true });
    await cp(join(repo, "LICENSE"), join(project, "LICENSE.cv-tailor"));
    const wizard = await readFile(join(assets, "deploy-wizard.mjs"), "utf8");
    const defaults = JSON.stringify({ provider, outputDir: null });
    await writeFile(join(project, "deploy-wizard.mjs"), wizard.replace(
      "const defaults = { provider: null, outputDir: null };", `const defaults = ${defaults};`,
    ), "utf8");
    await writePortfolioConfig(project, config);
  } catch (error) {
    await rm(project, { recursive: true, force: true });
    throw error;
  }
  return project;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [stack, target, input, provider] = process.argv.slice(2);
  try {
    if (!stack || !target || !input || process.argv.length > 6) {
      throw new Error("Usage: node scaffold_portfolio.mjs <nextjs|vite-react> <absolute-new-project-dir> <public-config.json> [vercel|cloudflare]");
    }
    const config = JSON.parse(await readFile(input, "utf8"));
    const project = await scaffoldPortfolio({ stack, target, config, provider });
    console.log(`Scaffolded ${stack} portfolio in ${project}`);
  } catch (error) {
    console.error(`Portfolio scaffold: ${error.message}`);
    process.exitCode = 1;
  }
}
