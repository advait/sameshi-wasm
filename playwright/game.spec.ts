import { expect, test, type Page } from "@playwright/test";

async function clickSquare(page: Page, square: string): Promise<void> {
  const board = page.getByTestId("board");
  const box = await board.boundingBox();
  if (!box) {
    throw new Error("Board is not visible");
  }

  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number.parseInt(square[1], 10);
  const squareSize = box.width / 8;
  const x = box.x + (file + 0.5) * squareSize;
  const y = box.y + ((8 - rank) + 0.5) * squareSize;

  await page.mouse.click(x, y);
}

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

  await clickSquare(page, "e2");
  await clickSquare(page, "e4");

  await expect(page.getByTestId("ply-count")).toHaveText("2", { timeout: 20_000 });

  const moveItems = page.locator("[data-testid='ply-history'] li");
  await expect(moveItems.nth(0)).toContainText("e2e4");
  await expect(page.getByTestId("status")).toContainText("Your move");
});
