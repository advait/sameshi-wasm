import { expect, test, type Page } from "@playwright/test";

function squareCenter(box: { x: number; y: number; width: number; height: number }, square: string): { x: number; y: number } {
  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number.parseInt(square[1], 10);
  const squareSize = Math.min(box.width, box.height) / 8;
  return {
    x: box.x + (file + 0.5) * squareSize,
    y: box.y + ((8 - rank) + 0.5) * squareSize,
  };
}

async function dragMove(page: Page, from: string, to: string): Promise<void> {
  const boardSurface = page.locator("[data-testid='board'] cg-board").first();
  const boardContainer = page.getByTestId("board");

  await expect(boardContainer).toBeVisible();

  let box = await boardSurface.boundingBox();
  if (!box) {
    box = await boardContainer.boundingBox();
  }
  if (!box) {
    throw new Error("Board is not visible");
  }

  const start = squareCenter(box, from);
  const end = squareCenter(box, to);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
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

  await dragMove(page, "e2", "e4");

  await expect(page.getByTestId("ply-count")).toHaveText("2", { timeout: 20_000 });

  const moveItems = page.locator("[data-testid='ply-history'] li");
  await expect(moveItems.nth(0)).toContainText("e2e4");
  await expect(page.getByTestId("status")).toContainText("Your move");
});
