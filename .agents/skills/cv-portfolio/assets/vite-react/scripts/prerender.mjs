import { readFile, rm, writeFile } from "node:fs/promises";
import { renderedHead, renderedPage, robots, sitemap } from "../.portfolio-ssr/entry-server.js";

const indexPath = new URL("../dist/index.html", import.meta.url);
const index = await readFile(indexPath, "utf8");
const root = '<div id="root"></div>';
if (!index.includes(root) || !index.includes("</head>")) {
  throw new Error('Keep an empty <div id="root"></div> and a </head> tag in index.html for the portfolio export.');
}
await writeFile(indexPath, index.replace("</head>", () => `${renderedHead}\n</head>`)
  .replace(root, () => `<div id="root">${renderedPage}</div>`), "utf8");
await writeFile(new URL("../dist/robots.txt", import.meta.url), robots, "utf8");
if (sitemap) await writeFile(new URL("../dist/sitemap.xml", import.meta.url), sitemap, "utf8");
await rm(new URL("../.portfolio-ssr/", import.meta.url), { recursive: true, force: true });
console.log("Prerendered the portfolio and static SEO files in dist/.");
