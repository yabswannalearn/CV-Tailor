import { expect, test } from "@playwright/test";

const designNames = ["Editorial Minimal", "Bento Grid", "Technical / Engineer", "Case Study", "Executive / Classic", "Bold Studio"];
const prompt = "Use CV Tailor's cv-portfolio skill with the Bento Grid Portfolio Design (design: bento). Remember this in my workspace preferences (portfolio_preference) unless I ask to change it later. Ask me which frontend stack I prefer (defaulting to Next.js static export, with Vite + React or other options explained with trade-offs), review what profile details should stay private, scaffold my portfolio outside the CV Tailor repo, verify the local build, and generate the deploy-wizard.mjs script for Vercel or Cloudflare Pages.";

test("all six Portfolio Designs have loaded desktop previews", async ({ page }) => {
  await page.goto("/#portfolio-designs");
  const gallery = page.getByRole("region", { name: "Launch your portfolio." });
  await expect(gallery.getByRole("article")).toHaveCount(6);
  for (const name of designNames) {
    const card = gallery.getByRole("article").filter({ has: page.getByRole("heading", { name, exact: true }) });
    const image = card.getByRole("img");
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1280);
  }
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`portfolio previews switch viewports and restore focus on Escape in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/#portfolio-designs");
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    const trigger = page.getByRole("button", { name: "Preview Technical / Engineer", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Technical / Engineer", exact: true });
    await expect(dialog).toBeVisible();
    const image = dialog.getByRole("img");
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1280);
    await dialog.getByRole("button", { name: "Mobile", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Mobile", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(390);
    await dialog.getByRole("button", { name: "Desktop", exact: true }).click();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1280);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });
}

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
  const dialogWidth = await dialog.evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth }));
  expect(dialogWidth.content).toBeLessThanOrEqual(dialogWidth.width);
});
