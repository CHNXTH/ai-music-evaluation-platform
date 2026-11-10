import { defineConfig } from '@playwright/test';
const external = process.env.PUBLIC_URL;
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 90000,
  expect: { timeout: 10000 },
  use: {
    baseURL: external ?? 'http://127.0.0.1:4173/ai-music-evaluation-platform/',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    browserName: 'chromium',
  },
  webServer: external
    ? undefined
    : {
        command: 'npm run dev -- --port 4173',
        url: 'http://127.0.0.1:4173/ai-music-evaluation-platform/',
        reuseExistingServer: !process.env.CI,
      },
  reporter: [['list'], ['html', { open: 'never' }]],
});
