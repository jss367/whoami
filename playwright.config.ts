import { defineConfig, devices } from '@playwright/test';
import * as fs from 'node:fs';

const BRAVE_PATH = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const braveAvailable = fs.existsSync(BRAVE_PATH);

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/report.json' }]],
  outputDir: 'test-results/artifacts',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx http-server -p 4173 -a 127.0.0.1 -c-1 --silent .',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'firefox-rfp',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          firefoxUserPrefs: {
            'privacy.resistFingerprinting': true,
          },
        },
      },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] },
    },
    ...(braveAvailable
      ? [
          {
            name: 'brave',
            use: {
              ...devices['Desktop Chrome'],
              launchOptions: { executablePath: BRAVE_PATH },
            },
          },
        ]
      : []),
  ],
});
