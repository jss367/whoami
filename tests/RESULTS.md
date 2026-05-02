# Cross-browser fingerprint test results

Suite: `tests/cross-browser.spec.ts` against PR #7 (`fingerprint-explanation` merged into this branch).
Playwright 1.59.1 on macOS arm64 (Darwin 25.4.0). All browsers run **headless**.

```
Running 36 tests using 1 worker
  6 passed (42.6s)
  30 skipped (each test is gated to one project)
```

The "30 skipped" line is structural: the file has 6 tests × 6 projects = 36 cells, and each test is `test.skip`-gated to its single matching project so each project only runs one of the six. Net useful runs: 6.

**Fixes applied based on review feedback** (see commit history):
- `detectBrowserName()` filters `HeadlessChrome` from `userAgentData.brands`, so headless Chromium falls through to `Chromium <ver>` instead of `HeadlessChrome <ver>`.
- `detectBrowserName()` matches `CriOS`, `EdgiOS`, `FxiOS`, and `OPiOS` ahead of the Safari fallback so iOS Chrome/Edge/Firefox/Opera aren't mislabelled as Safari.
- `detectBrowserClass()` falls back to the masked `gl.VENDOR` / `gl.RENDERER` when `WEBGL_debug_renderer_info` is unavailable, so Tor builds that block the unmasked extension still match.
- `detectBrowserClass()` returns `'rfp'` (renamed from `'tor'`) and the verdict reads `Tor Browser or Firefox with privacy.resistFingerprinting detected — …`. Tor Browser uses Firefox's RFP under the hood, so client-side the two are deliberately indistinguishable; the label now reflects what is actually being measured.
- `detectBrowserClass()` additionally requires `Intl.DateTimeFormat().resolvedOptions().timeZone === 'UTC'` (or `getTimezoneOffset() === 0`) before returning `'rfp'`. RFP/Tor force UTC unconditionally; this gate prevents the verdict from firing on plain Firefox configs that happen to also have no voices and a blocked WebGL extension.
- `loadFingerprintSummary()` now calls `checkHashStability()` before the `signalCount === 0` early return, so `fp-stability` populates even when every fingerprint probe is blocked.
- The `fp-stability` "all signals match" message no longer claims unconditional cross-visit trackability; it now notes that cross-session linkability depends on whether the browser farbles per-launch (Brave's per-session farbling means same-session reload matches don't imply cross-session linkability).
- `playwright.config.ts` `mobile-chromium` project switched from `devices['iPhone 12']` (which is Mobile Safari/WebKit) to `devices['Pixel 5']`, so it actually exercises mobile Chromium.

---

## 1. Chromium (default) — **PASS**

| Field | Visit 1 | Visit 2 |
|---|---|---|
| `#browser-name` | `Chromium 147` | `Chromium 147` |
| `#fp-stability` | `First visit — reload the page to compare canvas, WebGL, and audio hashes against this session.` | `3 of 3 hardware signals (canvas, webgl, audio) match the stored previous values — stable across reloads in this session. Cross-session linkability also depends on whether the browser regenerates these on a fresh launch (e.g. Brave farbles per-session, so reload-stable values can still differ across sessions).` |
| `#fp-uniqueness` | `7 signals collected — high fingerprinting surface. Real-world uniqueness depends on how rare each value is in the wider population, which this page cannot measure (try AmIUnique or Panopticlick for that).` | (same) |
| `#fp-hash` | `67e0116cf86a085b2f7d94b413810378…` | `67e0116cf86a085b2f7d94b413810378…` |
| `#user-agent` | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36` + `Brands: HeadlessChrome 147, Not.A/Brand 8, Chromium 147` | (same) |

- **Screenshot**: `test-results/chromium.png`
- **Console errors**: none
- **Verdict**: PASS — headless Chrome's `Brands` line legitimately advertises `HeadlessChrome`; the filter in `detectBrowserName()` skips that brand so the card resolves to `Chromium 147`. The raw `Brands:` line in `#user-agent` still surfaces it verbatim, which is the correct behavior for a "what does the browser advertise" card.

---

## 2. Firefox (default) — **PASS**

| Field | Visit 1 | Visit 2 |
|---|---|---|
| `#browser-name` | `Firefox 148.0` | `Firefox 148.0` |
| `#fp-stability` | `First visit — reload…` | `3 of 3 hardware signals (canvas, webgl, audio) match the stored previous values — stable across reloads in this session. Cross-session linkability also depends on whether the browser regenerates these on a fresh launch (e.g. Brave farbles per-session, so reload-stable values can still differ across sessions).` |
| `#fp-uniqueness` | `7 signals collected — high fingerprinting surface. …` | (same) |
| `#fp-hash` | `dbf07e3dbc0756b0779e8ce3108f9ed1…` | `dbf07e3dbc0756b0779e8ce3108f9ed1…` |
| `#user-agent` | `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0.2) Gecko/20100101 Firefox/148.0.2` | (same) |

- **Screenshot**: `test-results/firefox.png`
- **Console errors**: none
- **Verdict**: PASS — Firefox doesn't implement `userAgentData`, so the UA-string regex fallback fired and produced `Firefox 148.0`.

---

## 3. Firefox with `privacy.resistFingerprinting` — **PASS**

Launched via `firefoxUserPrefs: { 'privacy.resistFingerprinting': true }`.

| Field | Visit 1 | Visit 2 |
|---|---|---|
| `#browser-name` | `Firefox 148.0` | `Firefox 148.0` |
| `#fp-stability` | `First visit — reload…` | **`Partial randomization: 1 changed (canvas), 2 stable (webgl, audio).`** |
| `#fp-uniqueness` | (same as visit 2) | **`Tor Browser or Firefox with privacy.resistFingerprinting detected — fingerprint signals are normalized (vendor/renderer report "Mozilla", voices empty) so this hash is shared across other users running the same configuration. Client-side detection cannot distinguish Tor from plain Firefox+RFP.`** |
| `#fp-hash` | (varies — canvas is re-salted per call) | `fd91ed81da96c1b2759d4ea68511490e…` |
| `#user-agent` | `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0.2) Gecko/20100101 Firefox/148.0.2` | (same) |

- **Screenshot**: `test-results/firefox-rfp.png`
- **Console errors**: none
- **Verdict**: PASS — the false positive flagged by Codex on PR #7 (`Tor Browser detected` for plain Firefox+RFP) is gone. RFP and Tor Browser produce identical client-side signals by design (Tor builds on top of RFP), so the verdict label now covers both rather than asserting Tor specifically.
- **Bonus**: `#fp-stability` reports `Partial randomization: 1 changed (canvas), 2 stable (webgl, audio)`. RFP randomizes canvas reads per call but keeps WebGL and audio outputs deterministic — useful confirmation that the stability card behaves as designed.

---

## 4. WebKit (Safari engine, **not** the Safari app) — **PASS**

| Field | Visit 1 | Visit 2 |
|---|---|---|
| `#browser-name` | `Safari 26.4` | `Safari 26.4` |
| `#fp-stability` | `First visit — reload…` | `3 of 3 hardware signals (canvas, webgl, audio) match the stored previous values — stable across reloads in this session. Cross-session linkability also depends on whether the browser regenerates these on a fresh launch (e.g. Brave farbles per-session, so reload-stable values can still differ across sessions).` |
| `#fp-uniqueness` | `8 signals collected — high fingerprinting surface. …` | (same) |
| `#fp-hash` | `aea483e9d8028281fcb72bf7d4ca8c9f…` | `aea483e9d8028281fcb72bf7d4ca8c9f…` |
| `#user-agent` | `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Safari/605.1.15` | (same) |

- **Screenshot**: `test-results/webkit.png`
- **Console errors**: none
- **Verdict**: PASS — WebKit doesn't implement `userAgentData`, so the regex fallback grabs `Version/26.4` and tags it `Safari 26.4`. Reminder: this is Playwright's WebKit build, **not** Safari.app.

---

## 5. Brave (local executable) — **PASS (with caveat about session-stable farbling)**

Launched via `executablePath: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"`, headless.

| Field | Visit 1 | Visit 2 |
|---|---|---|
| `#browser-name` | `Brave 145` | `Brave 145` |
| `#fp-stability` | `First visit — reload…` | **`3 of 3 hardware signals (canvas, webgl, audio) match the stored previous values — stable across reloads in this session. Cross-session linkability also depends on whether the browser regenerates these on a fresh launch (e.g. Brave farbles per-session, so reload-stable values can still differ across sessions).`** |
| `#fp-uniqueness` | **`Brave fingerprint protection detected — several signals are randomized ("farbled") per session, so this hash is not a stable cross-site identifier. Individual snapshots can still look unusual.`** | (same) |
| `#fp-hash` | `bd056fff59d32ea1fdcf6af3b379894d…` | `bd056fff59d32ea1fdcf6af3b379894d…` |
| `#user-agent` | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36` + `Brands: Not:A-Brand 99, Brave 145, Chromium 145` | (same) |

- **Screenshot**: `test-results/brave.png`
- **Console errors**: none
- **Verdict**: PASS — `navigator.brave.isBrave()` returns `true` even in headless Brave, so the Brave branch fires. `#browser-name` resolves to `Brave 145` from the UA Client Hints brand.
- **Divergence from the matrix worth surfacing**: Brave farbles deterministically per session, not per page-load — within one running browser instance the canvas, WebGL, and audio salts are stable, so reloading the same site yields identical hashes. The test reuses one `BrowserContext` for both visits, so we observe stable hashes. Cross-session farbling (separate Brave launches with separate user-data dirs) would change them.

---

## 6. Mobile Chromium (Pixel 5 emulation) — **PASS**

`devices['Pixel 5']` (393×851, Android Chrome UA, `isMobile: true`).

| Field | Visit 1 | Visit 2 |
|---|---|---|
| `#browser-name` | `Chromium 147` | `Chromium 147` |
| `#fp-stability` | `First visit — reload…` | `3 of 3 hardware signals (canvas, webgl, audio) match the stored previous values — stable across reloads in this session. Cross-session linkability also depends on whether the browser regenerates these on a fresh launch (e.g. Brave farbles per-session, so reload-stable values can still differ across sessions).` |
| `#fp-uniqueness` | `7 signals collected — high fingerprinting surface. …` | (same) |
| `#fp-hash` | `bafc252bd5e96afef2d4bc29875a4535…` | `bafc252bd5e96afef2d4bc29875a4535…` |
| `#user-agent` | `Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Mobile Safari/537.36` + `Brands: HeadlessChrome 147, Not.A/Brand 8, Chromium 147` | (same) |

- **Screenshot**: `test-results/mobile-chromium.png` *(use this to confirm cards don't overflow at 393px — they do not, layout is fine)*
- **Console errors**: none (after filtering external `ipapi.co` rate-limit noise; see "what I couldn't verify" below)
- **Verdict**: PASS — the Codex P1 finding that the project name was misleading is fixed. Switching to `devices['Pixel 5']` runs an Android-Chromium UA with `isMobile: true`, the UA-CH brands are present, and `detectBrowserName()` correctly resolves to `Chromium 147`.

---

## What I couldn't verify

Honest gaps:

- **Tor Browser** — not automated. RFP-equivalent behavior is exercised via the `firefox-rfp` project, which is the same code path Tor Browser hits; the Tor-specific UA, timezone normalization, and letterboxing are not driven here.
- **Real Safari (the macOS app)** — Playwright's WebKit is not Safari. Brand strings, ITP behavior, prefer-color-scheme plumbing, and `navigator.userAgent` differ from Safari.app.
- **Cross-session Brave farbling** — Row 5 reuses the same `BrowserContext` for both visits, so we test session stability (it is stable), not whether separate Brave launches randomize.
- **iOS browser tokens (`CriOS`, `FxiOS`, `EdgiOS`, `OPiOS`)** — added to `detectBrowserName()` but not exercised by the suite. Playwright doesn't emulate iOS Chrome/Firefox/Edge specifically; verifying these requires real iOS devices or a manually-set UA string.
- **Headless vs. headed parity** — every project ran headless. Real users browse headed; headed runs are still worth a manual spot-check before shipping.
- **Real headless `ipapi.co` failures** — `script.js`'s `loadIpData()` calls a public service which rate-limits; the page emits a benign `console.error` under that pressure. These are filtered out via `IGNORABLE_CONSOLE` so they don't flake the suite.

---

## How to run

```bash
npm install
npx playwright install chromium firefox webkit
npx playwright test
```

The Brave row only runs if `/Applications/Brave Browser.app/Contents/MacOS/Brave Browser` exists; if not, the project is omitted from `playwright.config.ts` at load time (no skip noise in the report).

Screenshots land in `test-results/<config-name>.png`; per-test capture JSON is attached to each test result and viewable via `npx playwright show-report` (note: the suite uses the `list` + `json` reporters by default, not `html`; pass `--reporter=html` if you want the GUI).
