import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const READY_TIMEOUT = 15_000;
const SHOWN_IDS = ['browser-name', 'fp-stability', 'fp-uniqueness', 'fp-hash', 'user-agent'] as const;
type FieldId = (typeof SHOWN_IDS)[number];
type Capture = Record<FieldId, string>;

// External services + permission denials we can't control are filtered so they don't fail the suite.
// Real fingerprint logic errors will not match this.
const IGNORABLE_CONSOLE =
  /ipapi\.co|Failed to (fetch|load resource)|net::ERR_|NetworkError when attempting|Access-Control-Allow-Origin|access control checks|Geolocation|429/i;

async function waitReady(page: Page) {
  await expect(page.locator('#fp-uniqueness')).not.toHaveText(/Analyzing…|Insufficient/, { timeout: READY_TIMEOUT });
  await expect(page.locator('#fp-hash')).not.toHaveText(/Computing…/, { timeout: READY_TIMEOUT });
  await expect(page.locator('#fp-stability')).not.toHaveText(/Checking…/, { timeout: READY_TIMEOUT });
}

async function readCapture(page: Page): Promise<Capture> {
  const entries = await Promise.all(
    SHOWN_IDS.map(async (id) => [id, ((await page.locator(`#${id}`).textContent()) ?? '').trim()] as const),
  );
  return Object.fromEntries(entries) as Capture;
}

function attachConsoleHandlers(page: Page, errors: string[]) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORABLE_CONSOLE.test(text)) return;
    errors.push(`console.error: ${text}`);
  });
  page.on('pageerror', (err) => {
    if (IGNORABLE_CONSOLE.test(err.message)) return;
    errors.push(`pageerror: ${err.message}`);
  });
}

async function twoVisitFlow(context: BrowserContext, slug: string) {
  const errors: string[] = [];

  const page1 = await context.newPage();
  attachConsoleHandlers(page1, errors);
  await page1.goto('/');
  await waitReady(page1);
  const visit1 = await readCapture(page1);
  await page1.close();

  const page2 = await context.newPage();
  attachConsoleHandlers(page2, errors);
  await page2.goto('/');
  await waitReady(page2);
  const visit2 = await readCapture(page2);
  await page2.screenshot({ path: `test-results/${slug}.png`, fullPage: true });
  await page2.close();

  return { visit1, visit2, errors };
}

async function attachCapture(testInfo: { attach: (n: string, p: { body: string; contentType: string }) => Promise<void> }, payload: unknown) {
  await testInfo.attach('capture', { body: JSON.stringify(payload, null, 2), contentType: 'application/json' });
}

test.describe('cross-browser fingerprint demo', () => {
  test('Chromium default', async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium');
    const r = await twoVisitFlow(context, 'chromium');
    await attachCapture(testInfo, r);

    expect(r.visit1['fp-stability']).toMatch(/First visit/);
    expect(r.visit2['browser-name']).toMatch(/^(Google Chrome|Chromium)\s+\d+/);
    expect(r.visit2['fp-stability']).toMatch(/match the stored previous values/);
    expect(r.visit2['fp-uniqueness']).toMatch(/signals collected.*high fingerprinting surface/);
    expect(r.errors, `unexpected console errors: ${r.errors.join('\n')}`).toEqual([]);
  });

  test('Firefox default', async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== 'firefox');
    const r = await twoVisitFlow(context, 'firefox');
    await attachCapture(testInfo, r);

    expect(r.visit1['fp-stability']).toMatch(/First visit/);
    expect(r.visit2['browser-name']).toMatch(/^Firefox\s+\d+/);
    expect(r.visit2['fp-stability']).toMatch(/match the stored previous values/);
    expect(r.visit2['fp-uniqueness']).toMatch(/signals collected/);
    expect(r.errors, `unexpected console errors: ${r.errors.join('\n')}`).toEqual([]);
  });

  test('Firefox with privacy.resistFingerprinting', async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== 'firefox-rfp');
    const r = await twoVisitFlow(context, 'firefox-rfp');
    await attachCapture(testInfo, r);

    expect(r.visit1['fp-stability']).toMatch(/First visit/);
    expect(r.visit2['browser-name']).toMatch(/^Firefox\s+\d+/);
    // Tor and Firefox+RFP are deliberately indistinguishable client-side, so the verdict
    // is broadened to cover both rather than asserting Tor specifically.
    expect(r.visit2['fp-uniqueness']).toMatch(/Tor Browser or Firefox with privacy\.resistFingerprinting/);
    expect(r.errors, `unexpected console errors: ${r.errors.join('\n')}`).toEqual([]);
  });

  test('WebKit', async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit');
    const r = await twoVisitFlow(context, 'webkit');
    await attachCapture(testInfo, r);

    expect(r.visit1['fp-stability']).toMatch(/First visit/);
    // WebKit's UA may render as "Safari X" via UA-string fallback, since userAgentData isn't implemented.
    expect(r.visit2['browser-name']).toMatch(/^Safari/);
    expect(r.visit2['fp-stability']).toMatch(/match the stored previous values/);
    expect(r.visit2['fp-uniqueness']).toMatch(/signals collected/);
    expect(r.errors, `unexpected console errors: ${r.errors.join('\n')}`).toEqual([]);
  });

  test('Brave', async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== 'brave');
    const r = await twoVisitFlow(context, 'brave');
    await attachCapture(testInfo, r);

    expect(r.visit1['fp-stability']).toMatch(/First visit/);
    expect(r.visit2['browser-name']).toMatch(/^Brave\s+\d+/);
    // Headless Brave may not flip isBrave() / shields, so the farbling + Brave-detection
    // assertions are reported (not enforced) per spec instructions.
    expect(r.visit2['fp-hash']).not.toBe('');
    expect(r.errors, `unexpected console errors: ${r.errors.join('\n')}`).toEqual([]);
  });

  test('Mobile Chromium (Pixel 5 emulation)', async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium');
    const r = await twoVisitFlow(context, 'mobile-chromium');
    await attachCapture(testInfo, r);

    expect(r.visit1['fp-stability']).toMatch(/First visit/);
    expect(r.visit2['browser-name']).toMatch(/^(Google Chrome|Chromium)\s+\d+/);
    expect(r.visit2['fp-stability']).toMatch(/match the stored previous values/);
    // Layout overflow check is visual — see test-results/mobile-chromium.png.
    expect(r.errors, `unexpected console errors: ${r.errors.join('\n')}`).toEqual([]);
  });
});
