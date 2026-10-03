import { test, expect, type Page } from '@playwright/test';

// Hold callbacks so each request's pending, success, and failure states can be inspected.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const requests: { success: PositionCallback; error: PositionErrorCallback }[] = [];
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition(success: PositionCallback, error: PositionErrorCallback) {
          requests.push({ success, error });
        },
      },
    });
    (window as any).geoRequests = requests;
  });
  await page.route('https://ipapi.co/**', route => route.abort());
  await page.goto('/');
});

async function expectEmptyLocation(page: Page) {
  for (const id of ['geo-coords', 'geo-accuracy', 'geo-altitude']) {
    await expect(page.locator(`#${id}`)).toHaveText('—');
  }
}

async function shareLocation(page: Page, altitude: number | null = 42) {
  await page.evaluate(altitude => {
    (window as any).geoRequests.at(-1).success({
      timestamp: Date.now(),
      coords: { latitude: 12.34567, longitude: -76.54321, accuracy: 15.4, altitude },
    });
  }, altitude);
  await expect(page.locator('#geo-status')).toHaveText(/^Location shared at /);
  await expect(page.locator('#geo-coords')).toHaveText('12.34567, -76.54321');
  await expect(page.locator('#geo-accuracy')).toHaveText('15 meters');
  await expect(page.locator('#geo-altitude')).toHaveText(altitude === null ? 'Not provided' : '42.00 meters');
  await expect(page.locator('#geo-run')).toBeEnabled();
}

for (const [code, message] of [[1, 'Permission denied'], [2, 'Position unavailable'], [3, 'Timed out']] as const) {
  test(`clears shared location on retry and after ${message.toLowerCase()}`, async ({ page }) => {
    const button = page.locator('#geo-run');
    await expect(page.locator('#geo-status')).toHaveText('Not requested.');
    await expectEmptyLocation(page);
    expect(await page.evaluate(() => (window as any).geoRequests.length)).toBe(0);

    await button.click();
    await shareLocation(page);

    // Clearing must happen immediately, before a browser returns its error.
    await button.click();
    await expect(page.locator('#geo-status')).toHaveText('Waiting for permission…');
    await expectEmptyLocation(page);
    await expect(button).toBeDisabled();
    await button.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
    expect(await page.evaluate(() => (window as any).geoRequests.length)).toBe(2);

    await page.evaluate(({ code, message }) => {
      (window as any).geoRequests.at(-1).error({ code, message });
    }, { code, message });
    await expect(page.locator('#geo-status')).toHaveText(`Denied or unavailable (${message})`);
    await expectEmptyLocation(page);
    await expect(button).toBeEnabled();

    // A later success replaces the empty fields, including a missing altitude.
    await button.click();
    await shareLocation(page, null);
    expect(await page.evaluate(() => (window as any).geoRequests.length)).toBe(3);
  });
}

test('initial and repeated failures keep location empty and allow another retry', async ({ page }) => {
  for (let request = 1; request <= 3; request++) {
    await page.locator('#geo-run').click();
    await expectEmptyLocation(page);
    await page.evaluate(() => {
      (window as any).geoRequests.at(-1).error({ code: 1, message: 'Permission denied' });
    });
    await expect(page.locator('#geo-status')).toHaveText('Denied or unavailable (Permission denied)');
    await expectEmptyLocation(page);
    await expect(page.locator('#geo-run')).toBeEnabled();
    expect(await page.evaluate(() => (window as any).geoRequests.length)).toBe(request);
  }
});
