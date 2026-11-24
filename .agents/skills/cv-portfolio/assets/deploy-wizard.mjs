import { spawnSync } from "node:child_process";
import { resolve4, resolve6, resolveCname } from "node:dns/promises";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const defaults = { provider: null, outputDir: null };
const root = realpathSync(dirname(fileURLToPath(import.meta.url)));
const windows = process.platform === "win32";
const providerNames = { vercel: "Vercel", cloudflare: "Cloudflare Pages" };
const dashboards = {
  vercel: "https://vercel.com/new",
  cloudflare: "https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/pages",
};
const cloudflareDomains = "https://developers.cloudflare.com/pages/configuration/custom-domains/";

async function ask(question) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const cancel = new AbortController();
  terminal.once("close", () => cancel.abort());
  try {
    return (await terminal.question(`${question} `, { signal: cancel.signal })).trim();
  } finally {
    terminal.close();
  }
}

async function confirm(question, defaultYes = false) {
  for (;;) {
    const answer = (await ask(`${question} ${defaultYes ? "[Y/n]" : "[y/N]"}`)).toLowerCase();
    if (!answer) return defaultYes;
    if (answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
  }
}

async function choose(question, choices, defaultIndex) {
  choices.forEach((choice, index) => console.log(`  ${index + 1}) ${choice}${index === defaultIndex ? " (default)" : ""}`));
  for (;;) {
    const answer = await ask(`${question}${defaultIndex === undefined ? "" : ` [${defaultIndex + 1}]`}`);
    if (!answer && defaultIndex !== undefined) return defaultIndex;
    const index = choices.findIndex((_, i) => String(i + 1) === answer);
    if (index !== -1) return index;
  }
}

function npmScript(tool) {
  // Launch npm's Node entry point directly on Windows so .cmd shell parsing cannot change arguments.
  const dirs = [dirname(process.execPath), ...(process.env.PATH ?? "").split(delimiter).filter(Boolean)];
  return dirs.map(dir => join(dir, "node_modules", "npm", "bin", `${tool}-cli.js`)).find(existsSync);
}

function command(tool, args, capture = false) {
  if (windows && (tool === "npm" || tool === "npx")) {
    const script = npmScript(tool);
    if (!script) throw new Error(`Could not find ${tool}. Install Node.js with npm and reopen your terminal.`);
    args = [script, ...args];
    tool = process.execPath;
  }
  return spawnSync(tool, args, { cwd: root, encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
}

function run(tool, args, help) {
  const result = command(tool, args);
  if (result.status !== 0) throw new Error(`${tool} ${args.slice(0, 2).join(" ")} failed. ${help}`);
}

function read(tool, args) {
  const result = command(tool, args, true);
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function openUrl(url) {
  const launcher = windows ? "cmd.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = windows ? ["/d", "/s", "/c", `start "" "${url}"`] : [url];
  const result = spawnSync(launcher, args, { stdio: "ignore", timeout: 4000, windowsVerbatimArguments: windows });
  if (result.status !== 0) console.log(`Open this URL in your browser: ${url}`);
}

function projectOutput(directory) {
  const path = resolve(root, directory);
  const actual = existsSync(path) ? realpathSync(path) : path;
  const fromRoot = relative(root, actual);
  if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error("Choose a build output subdirectory inside the portfolio project, such as out, dist or site.");
  }
  return { path: actual, directory: fromRoot.split(sep).join("/") };
}

async function verifyBuild() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error("Install Node.js 22.12 or later and run the wizard again.");
  const npm = read("npm", ["--version"]);
  if (!npm) throw new Error("npm is unavailable. Install Node.js with npm and reopen your terminal.");
  console.log(`Node.js ${process.versions.node} | npm ${npm}`);

  const manifestPath = join(root, "package.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
  const dependencies = { ...manifest.devDependencies, ...manifest.dependencies };
  let stack = "other";
  if (dependencies.next) stack = "nextjs";
  else if (dependencies.vite && dependencies.react) stack = "vite";
  const detected = stack === "nextjs" ? "out" : stack === "vite" ? "dist" : undefined;
  const directory = defaults.outputDir ?? detected ?? await ask("Which subdirectory contains your static build?");
  projectOutput(directory);

  const build = manifest.scripts?.build ? "npm run build" : undefined;
  if (build) {
    if (!existsSync(join(root, "node_modules")) && await confirm("Install the portfolio dependencies with npm install?", true)) {
      run("npm", ["install"], "Review the npm error and run npm install in this project before trying again.");
    }
    if (await confirm("Run npm run build now?", true)) {
      run("npm", ["run", "build"], "Fix the build error above and run the wizard again.");
    }
  }
  const output = projectOutput(directory);
  const home = join(output.path, "index.html");
  if (!statSync(home, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Missing ${output.directory}/index.html. ${build ? `Run ${build} and check the output.` : "Place the public site in its output subdirectory."}`);
  }
  console.log(`Static output is ready in ${output.directory}/.`);
  return { stack, build, ...output };
}

function showBuildSettings(provider, output) {
  const preset = output.stack === "nextjs" ? (provider === "cloudflare" ? "Next.js (Static HTML Export)" : "Next.js")
    : output.stack === "vite" ? (provider === "cloudflare" ? "React (Vite)" : "Vite") : "None / Other";
  console.log(`\n${providerNames[provider]} build settings\n  Framework preset: ${preset}\n  Build command: ${output.build ?? (provider === "cloudflare" ? "exit 0" : "leave blank")}\n  Output directory: ${output.directory}`);
}

async function askMatching(question, pattern, hint = "Use a project slug with letters, digits or supported separators.") {
  for (;;) {
    const value = await ask(question);
    if (pattern.test(value)) return value;
    console.log(hint);
  }
}

async function directDeploy(provider, output) {
  const cli = provider === "vercel" ? "vercel" : "wrangler";
  console.log(`npx can install ${cli} locally if it is missing. Complete browser sign-in in your own session.`);
  run("npx", [cli, "--version"], `Check npm access to ${cli} and try again.`);
  if (await confirm(`Run npx ${cli} login now?`)) {
    run("npx", [cli, "login"], "Finish the browser sign-in before trying again.");
  }
  if (provider === "vercel") {
    showBuildSettings(provider, output);
    if (await confirm("Publish a production deployment with npx vercel --prod?")) {
      run("npx", ["vercel", "--prod"], "Check your Vercel login and confirm the project build settings.");
    }
    return undefined;
  }

  const name = await askMatching("Cloudflare Pages project name:", /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/);
  if (await confirm(`Publish ${output.directory}/ to the ${name} Pages project?`)) {
    run("npx", ["wrangler", "pages", "deploy", output.path, "--project-name", name],
      "Check your Cloudflare login and Pages project. Create a Direct Upload project if needed.");
  }
  return name;
}

async function connectGitHub(provider, output) {
  if (!read("git", ["--version"])) throw new Error("Install Git and reopen your terminal before connecting a GitHub repository.");
  const checkout = read("git", ["rev-parse", "--show-toplevel"]);
  if (checkout && relative(root, realpathSync(checkout))) {
    throw new Error("Move the portfolio outside the parent Git checkout before publishing it as a separate repository.");
  }
  if (!checkout) {
    if (!await confirm("Initialize a Git repository for this portfolio?")) return;
    run("git", ["init", "-b", "main"], "Check that this project directory is writable.");
  }
  run("git", ["status", "--short"], "Check the portfolio repository state and try again.");
  if (!read("git", ["rev-parse", "--verify", "HEAD"])) {
    if (!await confirm("Stage the files listed above and create the first commit?")) return;
    run("git", ["add", "-A"], "Review the working tree and try again.");
    run("git", ["commit", "-m", "Create portfolio"], "Check your local Git author settings and staged files.");
  } else if (read("git", ["status", "--porcelain"])) {
    console.log("Review and commit changes you want to include before pushing to GitHub.");
  }

  const origin = read("git", ["remote", "get-url", "origin"]);
  const githubOrigin = origin && /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)[\w.-]+\/[\w.-]+\/?$/i.test(origin);
  const remote = origin ? "github" : "origin";
  if (githubOrigin) {
    console.log("Push the reviewed commit to your existing GitHub repository with git push -u origin HEAD.");
  } else if (!read("git", ["remote", "get-url", remote]) && read("gh", ["--version"]) && read("gh", ["auth", "status"]) !== undefined
      && await confirm("Create a private GitHub repository with gh and push the current commit?")) {
    const name = await askMatching("GitHub repository name:", /^[a-z0-9][\w.-]{0,99}$/i);
    run("gh", ["repo", "create", name, "--private", "--source", ".", "--remote", remote, "--push"],
      "Check your GitHub login and whether the repository name is available. Use git status to see what was saved.");
  } else {
    const newRemote = read("git", ["remote", "get-url", remote]) ? "NEW-REMOTE-NAME" : remote;
    console.log(`Create an empty repository on GitHub, then run these commands with its HTTPS URL:\n  git remote add ${newRemote} https://github.com/YOUR-USER/YOUR-REPO.git\n  git push -u ${newRemote} HEAD`);
    openUrl("https://github.com/new");
  }

  showBuildSettings(provider, output);
  const branch = read("git", ["branch", "--show-current"]);
  if (branch) console.log(`  Production branch: ${branch}`);
  console.log("Import the GitHub repository in the hosting dashboard after pushing your reviewed commit.");
  if (await confirm("Open the hosting dashboard now?", true)) openUrl(dashboards[provider]);
}

async function customDomain(provider, pagesProject) {
  if (!await confirm("Do you want to connect a custom domain?")) return;
  const domain = await askMatching("Domain, for example portfolio.example.com:",
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})\.?$/i,
    "Enter the domain name only, such as portfolio.example.com.");
  const host = domain.toLowerCase().replace(/\.$/, "");
  if (provider === "vercel") {
    const add = await confirm(`Add ${host} to a Vercel project using the CLI?`);
    if (add) {
      const project = await askMatching("Vercel project name:", /^[a-z0-9][a-z0-9_.-]{0,99}$/i);
      run("npx", ["vercel", "domains", "add", host, project], "Check the project name and Vercel account or add the domain in the dashboard.");
    }
    console.log("Set the A record for your apex domain or the CNAME for your subdomain using the value shown in Vercel Project Settings → Domains.");
    const inspected = command("npx", ["vercel", "domains", "inspect", host]);
    if (inspected.status !== 0) console.log("Open Vercel Project Settings → Domains to copy the assigned DNS records.");
  } else {
    console.log("In Workers & Pages, open your Pages project, then select Custom domains → Set up a domain.");
    console.log(`Cloudflare creates the DNS record for a zone in your account. For an external DNS provider, point a subdomain CNAME to the production hostname ${pagesProject ? `(for example, ${pagesProject}.pages.dev)` : "shown as <project>.pages.dev"}. An apex domain requires Cloudflare nameservers.`);
    openUrl(cloudflareDomains);
  }

  const expected = await ask("Expected DNS target from your provider (optional, press Enter to list current records):");
  const normalize = value => value.toLowerCase().replace(/\.$/, "");
  if (!await confirm(`Check DNS for ${host} now?`, true)) return;
  do {
    const answers = await Promise.allSettled([resolveCname(host), resolve4(host), resolve6(host)]);
    const labels = ["CNAME", "A", "AAAA"];
    const records = answers.flatMap(answer => answer.status === "fulfilled" ? answer.value : []);
    answers.forEach((answer, index) => {
      const status = answer.status === "fulfilled" ? answer.value.join(", ")
        : ["ENODATA", "ENOTFOUND"].includes(answer.reason.code) ? "none visible" : `lookup failed (${answer.reason.code ?? "unknown"})`;
      console.log(`  ${labels[index]}: ${status}`);
    });
    const matched = expected && records.some(record => normalize(record) === normalize(expected));
    if (matched || (!expected && records.length)) {
      console.log(matched ? "The expected DNS target is visible." : "DNS records are visible. Compare them with your provider settings.");
      console.log("Check the provider dashboard for domain and HTTPS activation.");
      break;
    }
    console.log("The requested DNS record is still pending. Confirm the DNS settings and retry after propagation.");
  } while (await confirm("Retry this DNS lookup?"));
}

async function wrapUp() {
  for (;;) {
    const value = await ask("Enter your live portfolio URL from the hosting dashboard (or press Enter to skip):");
    if (!value) return;
    let url;
    try { url = new URL(value); } catch { /* Prompt again for a complete URL. */ }
    if (url && ["https:", "http:"].includes(url.protocol) && !url.username && !url.password) {
      console.log(`Live portfolio: ${url.href}\nTell your agent: Save ${url.href} to my CV Tailor profile (profile.portfolio).`);
      return;
    }
    console.log("Enter a complete public HTTP or HTTPS URL from your hosting provider.");
  }
}

async function main() {
  if (!process.stdin.isTTY) throw new Error("Run node deploy-wizard.mjs in an interactive terminal.");
  console.log("CV Tailor Deploy Wizard");
  const output = await verifyBuild();
  const providers = Object.keys(providerNames);
  const saved = providers.indexOf(defaults.provider);
  const provider = providers[await choose("Hosting provider?", Object.values(providerNames), saved === -1 ? 0 : saved)];
  const method = await choose("Deployment method?", ["Direct CLI deploy", "GitHub-connected deploy"], 0);
  let pagesProject;
  if (method === 0) pagesProject = await directDeploy(provider, output);
  else await connectGitHub(provider, output);
  await customDomain(provider, pagesProject);
  await wrapUp();
}

main().catch(error => {
  console.error(error.name === "AbortError" ? "Deployment wizard closed." : `Deploy Wizard: ${error.message}`);
  process.exitCode = 1;
});
