import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/visual-regression-fixture");
  await page.evaluate(() => document.fonts.ready);
});

test("benchmark dossier visual regression", async ({ page }) => {
  const dossier = page.getByTestId("report-dossier");
  await expect(dossier).toBeVisible();
  await expect(dossier).toHaveScreenshot("benchmark-dossier.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
  });
});

test("partial reference state visual regression", async ({ page }) => {
  const dossier = page.getByTestId("partial-dossier");
  await expect(dossier.getByText("Partial reference set")).toBeVisible();
  await expect(dossier).toHaveScreenshot("partial-reference-dossier.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
  });
});

test("shelf uses each published reference once", async ({ page }) => {
  const shelf = page.getByTestId("shelf-simulator");
  await expect(shelf).toBeVisible();
  const search = shelf.getByTestId("shelf-search");
  const grid = shelf.getByTestId("shelf-grid");

  for (const title of ["Hades", "Dead Cells", "Brotato"]) {
    await expect(
      search.locator(`img[alt="${title} published reference icon"]`)
    ).toHaveCount(1);
    await expect(
      grid.locator(`img[alt="${title} published reference icon"]`)
    ).toHaveCount(1);
  }

  await expect(shelf).toHaveScreenshot("shelf-simulator.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
  });
});
