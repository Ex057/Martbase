import { expect, test } from '@playwright/test';

import { attachFailureContext, watchConsoleMessages } from './helpers';

// A chart already saved with a DHIS2 legend color scheme
// (color_scheme = "dhis2_legendset_*"). Override per instance.
const SLICE_ID = Number(process.env.PLAYWRIGHT_COLOR_SLICE_ID || '41');

/**
 * Verifies a chart saved with a DHIS2 legend color scheme keeps that scheme on
 * load and across a reload. The regression: DHIS2 legend schemes register
 * asynchronously, so at render time the scheme was missing from the registry
 * and the control fell back to the theme default (and the chart painted an
 * empty palette). The fix awaits registration before hydrate.
 */
test('a DHIS2 legend color scheme persists on load and reload', async ({
  page,
}, testInfo) => {
  const consoleMessages = watchConsoleMessages(page);
  try {
    await page.goto(`/explore/?slice_id=${SLICE_ID}`);

    // The color-scheme control (aria-label "Select color scheme"). Its selected
    // value renders as the scheme's label; DHIS2 legend schemes are labelled
    // "DHIS2: <name>".
    const control = page.getByLabel('Select color scheme');
    await expect(control).toBeVisible({ timeout: 60000 });

    const selected = control.locator('.ant-select-selection-item');
    await expect(selected).toContainText('DHIS2', { timeout: 30000 });
    const beforeReload = (await selected.innerText()).trim();

    // Reload and confirm the DHIS2 scheme is still selected (not reset to the
    // theme default).
    await page.reload();
    const controlAfter = page.getByLabel('Select color scheme');
    await expect(controlAfter).toBeVisible({ timeout: 60000 });
    const selectedAfter = controlAfter.locator('.ant-select-selection-item');
    await expect(selectedAfter).toContainText('DHIS2', { timeout: 30000 });
    expect((await selectedAfter.innerText()).trim()).toBe(beforeReload);

    // The chart itself should render without an error alert.
    await expect(
      page.locator('[data-test="stacktrace"], .ant-result-error'),
    ).toHaveCount(0);
  } finally {
    await attachFailureContext(page, testInfo, consoleMessages);
  }
});
