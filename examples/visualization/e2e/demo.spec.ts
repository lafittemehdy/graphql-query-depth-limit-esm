/** Specifies modal keyboard containment, dismissal, and responsive example behavior. */
import { expect, test } from "@playwright/test";

for (const width of [1440, 390, 320]) {
  test(`welcome dialog and playground work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("./");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      // Browser chrome may receive focus; underlying application controls may not.
      expect(
        await page.evaluate(
          () =>
            document.activeElement === document.body ||
            Boolean(document.activeElement?.closest("dialog")),
        ),
      ).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const editor = page.getByRole("textbox", { name: "GraphQL query editor" });
    if (await editor.count()) {
      await editor.fill("{");
      await expect(page.getByText(/Syntax Error/).first()).toBeVisible();
    } else {
      await page.getByRole("button", { name: /Send Query/ }).click();
    }
    expect(errors).toEqual([]);
  });
}
