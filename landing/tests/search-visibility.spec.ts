import { expect, test } from "@playwright/test";

const origin = "https://www.cvtailor.me";
const paths = ["/", "/guides/ai-resume-builder/", "/guides/local-job-application-tracker/", "/guides/coding-agent-career-workspace/"];

test("every public page has a distinct canonical, social preview, and readable content without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const titles = new Set<string>();
  try {
    for (const path of paths) {
      const response = await page.goto(`http://127.0.0.1:3220${path}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${origin}${path}`);
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", `${origin}${path}`);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `${origin}/opengraph-image.png`);
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);
      await expect(page.locator('meta[name="robots"]')).not.toHaveAttribute("content", /noindex/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.locator("main")).toContainText("CV Tailor");
      titles.add(await page.title());
      const schema = JSON.parse(await page.locator('script[type="application/ld+json"]').innerText());
      const webpage = schema["@graph"].find((item: { "@type": string }) => item["@type"] === "WebPage");
      expect(webpage.url).toBe(`${origin}${path}`);
      if (path !== "/") {
        await expect(page.getByRole("link", { name: "Get started locally" })).toHaveAttribute("href", "/#install");
        await expect(page.getByRole("navigation", { name: "Related guides" }).getByRole("link")).toHaveCount(3);
      }
    }
    expect(titles.size).toBe(paths.length);
  } finally {
    await context.close();
  }
});

test("crawler files list exactly the public pages and the social image is a valid 1200 by 630 PNG", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain(`Sitemap: ${origin}/sitemap.xml`);
  expect(await robots.text()).toMatch(/User-agent: \*\s+Allow: \//);
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  const locations = [...(await sitemap.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  expect(locations.sort()).toEqual(paths.map(path => `${origin}${path}`).sort());
  const image = await request.get("/opengraph-image.png");
  expect(image.headers()["content-type"]).toContain("image/png");
  const bytes = await image.body();
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);
});

test("guides and their navigation fit small screens in both themes", async ({ page }, testInfo) => {
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of paths) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (path === "/") {
        await expect(page.locator("#guides").getByRole("link")).toHaveCount(3);
        await page.locator("#guides").screenshot({ path: testInfo.outputPath(`guides-${width}.png`) });
      } else {
        for (const theme of ["light", "dark"]) {
          await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          if (path.includes("coding-agent")) await page.screenshot({ path: testInfo.outputPath(`agent-guide-${width}-${theme}.png`) });
        }
      }
    }
  }
});
