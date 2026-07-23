import { expect, test } from '@playwright/test';

import { attachFailureContext, watchConsoleMessages } from './helpers';

// A dashboard with at least one chart. Override per instance.
const DASHBOARD_ID = Number(
  process.env.PLAYWRIGHT_FULLSCREEN_DASHBOARD_ID || '1',
);

/**
 * Verifies the per-chart "Enter fullscreen" overlay fills the viewport below the
 * navbar. The regression: GridStack's `.grid-stack-item-content` applies a hover
 * `transform` + `overflow: hidden`, which makes it the containing block for the
 * `position: fixed` overlay and clips it to the tile, so the chart never fills
 * the screen. The fix neutralizes that ancestor while a chart is fullscreen.
 */
test('chart fullscreen fills the viewport below the navbar', async ({
  page,
}, testInfo) => {
  const consoleMessages = watchConsoleMessages(page);
  try {
    await page.goto(`/superset/dashboard/${DASHBOARD_ID}/`);

    // Wait for at least one chart tile to render.
    const holder = page
      .locator('[data-test="dashboard-component-chart-holder"]')
      .first();
    await expect(holder).toBeVisible({ timeout: 60000 });

    // Open the chart's More-Options menu and enter fullscreen.
    await holder.hover();
    const moreOptions = holder.locator('[id$="-controls"]').first();
    await moreOptions.click();
    await page.getByRole('menuitem', { name: 'Enter fullscreen' }).click();

    // Read the navbar offset the overlay is intentionally placed below.
    const offset = await page.evaluate(
      () =>
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--dashboard-fullscreen-top-offset',
          ),
        ) || 0,
    );

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const { width: vw, height: vh } = viewport!;

    // The holder is the element that receives position:fixed + 100vw/100vh.
    const fsHolder = page
      .locator('[data-test="dashboard-component-chart-holder"]')
      .first();
    await expect
      .poll(async () => (await fsHolder.boundingBox())?.width ?? 0, {
        timeout: 10000,
      })
      .toBeGreaterThan(vw * 0.95);

    const box = await fsHolder.boundingBox();
    expect(box).not.toBeNull();
    // Fills the width edge-to-edge and sits below the navbar, filling the rest
    // of the height. Allow a few px for sub-pixel rounding.
    expect(box!.x).toBeLessThanOrEqual(2);
    expect(box!.width).toBeGreaterThanOrEqual(vw - 2);
    expect(Math.abs(box!.y - offset)).toBeLessThanOrEqual(2);
    expect(box!.height).toBeGreaterThanOrEqual(vh - offset - 2);
  } finally {
    await attachFailureContext(page, testInfo, consoleMessages);
  }
});
