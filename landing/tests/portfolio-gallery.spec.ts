import { expect, test } from "@playwright/test";

const designIds = [
  { id: "editorial", name: "Editorial Minimal" },
  { id: "bento", name: "Bento Grid" },
  { id: "technical", name: "Technical / Engineer" },
  { id: "case-study", name: "Case Study" },
  { id: "executive", name: "Executive / Classic" },
  { id: "bold-studio", name: "Bold Studio" },
];
const prompt =
  "Use CV Tailor's cv-portfolio skill with the Bento Grid Portfolio Design (design: bento). Remember this in my workspace preferences (portfolio_preference) unless I ask to change it later. Ask me where to place the portfolio directory and which frontend stack I prefer (defaulting to Next.js static export, with Vite + React or other options explained with trade-offs), review what profile details should stay private, scaffold my portfolio outside the CV Tailor repo, verify the local build, and generate the deploy-wizard.mjs script for Vercel or Cloudflare Pages.";

test("the landing page explains static portfolio SEO", async ({ page }) => {
  await page.goto("/#features");
  await expect(page.getByRole("heading", { name: "Publish a search-ready portfolio" })).toBeVisible();
  const question = page.getByText("What SEO features come with a generated portfolio?", { exact: true });
  await question.click();
  await expect(page.getByText(/Set the confirmed public URL to add a canonical link and sitemap/)).toBeVisible();
});

test("all six Portfolio Designs render live dynamic iframe previews", async ({ page }) => {
  await page.goto("/#portfolio-designs");
  const gallery = page.getByRole("region", { name: "Launch your portfolio." });
  await expect(gallery.getByRole("article")).toHaveCount(6);
  for (const { id, name } of designIds) {
    const card = gallery.getByRole("article").filter({ has: page.getByRole("heading", { name, exact: true }) });
    const frameLocator = card.frameLocator(`iframe[src="/portfolio-designs/${id}/"]`);
    await card.scrollIntoViewIfNeeded();
    await expect(frameLocator.getByRole("heading", { name: "Reinael Yabut", level: 1 })).toBeVisible();
  }
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`live portfolio modal switches viewports, supports in-frame interactivity, and restores focus on Escape in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/#portfolio-designs");
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    const trigger = page.getByRole("button", { name: "Preview Technical / Engineer", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Technical / Engineer", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Open full page" })).toHaveAttribute(
      "href",
      "/portfolio-designs/technical/",
    );
    const stageFrame = dialog.frameLocator("iframe");
    await expect(stageFrame.getByRole("heading", { name: "Reinael Yabut", level: 1 })).toBeVisible();
    // Interact live inside the preview iframe: toggle theme mode and filter projects.
    await stageFrame.getByRole("button", { name: /Switch to light mode/i }).click();
    await expect(stageFrame.locator("#portfolio")).toHaveAttribute("data-mode", "light");
    await dialog.getByRole("button", { name: "Mobile", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Mobile", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.locator(".portfolio-preview-stage")).toHaveAttribute("data-viewport", "mobile");
    await dialog.getByRole("button", { name: "Desktop", exact: true }).click();
    await expect(dialog.locator(".portfolio-preview-stage")).toHaveAttribute("data-viewport", "desktop");
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });
}

test("standalone live portfolio route filters projects and fits mobile without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/portfolio-designs/bento/");
  await expect(page.getByRole("heading", { name: "Reinael Yabut", level: 1 })).toBeVisible();
  await expect(page.getByText("3+")).toBeVisible();
  const filterGroup = page.getByRole("group", { name: "Filter projects by topic" });
  await expect(filterGroup).toBeVisible();
  await filterGroup.getByRole("button", { name: "AI Automation" }).click();
  await expect(filterGroup.getByRole("button", { name: "AI Automation" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("mobile navigation reaches the gallery and copies the exact portfolio prompt", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Portfolios" }).click();
  await expect(page).toHaveURL(/#portfolio-designs$/);
  await page.getByRole("button", { name: "Copy Bento Grid portfolio prompt", exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(prompt);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Preview Bold Studio", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Bold Studio", exact: true });
  await expect(dialog).toBeVisible();
  const dialogWidth = await dialog.evaluate((element) => ({ width: element.clientWidth, content: element.scrollWidth }));
  expect(dialogWidth.content).toBeLessThanOrEqual(dialogWidth.width);
});
