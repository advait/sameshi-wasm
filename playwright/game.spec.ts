import { expect, test } from "@playwright/test";

test("player can move and engine responds", async ({ page }) => {
  await page.goto("/");

  await page.waitForFunction(() => {
    const status = document.querySelector("[data-testid='status']")?.textContent ?? "";
    if (status.includes("Engine failed to boot.")) {
      const feedback = document.querySelector("[data-testid='feedback']")?.textContent ?? "";
      throw new Error(`Engine bootstrap failed: ${feedback}`);
    }
    return status.includes("Your move");
  }, { timeout: 30_000 });

  await expect(page.getByTestId("status")).toContainText("Your move");
  await expect(page.getByTestId("ply-count")).toHaveText("0");

  await page.getByTestId("move-input").fill("e2e4");
  await page.getByTestId("make-move").click();

  await expect(page.getByTestId("ply-count")).toHaveText("2", { timeout: 20_000 });

  const moveItems = page.locator("[data-testid='ply-history'] li");
  await expect(moveItems.nth(0)).toContainText("e2e4");
  await expect(page.getByTestId("status")).toContainText("Your move");
});
