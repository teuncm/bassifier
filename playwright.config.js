import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: process.env.BASSIFIER_TEST_URL || "http://127.0.0.1:5187",
    channel: process.env.BASSIFIER_TEST_CHANNEL || "chrome",
    viewport: { width: 1280, height: 1000 },
    reducedMotion: "reduce",
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: process.env.BASSIFIER_TEST_URL
    ? undefined
    : {
        command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5187 --strictPort",
        url: "http://127.0.0.1:5187",
        reuseExistingServer: !process.env.CI,
      },
});
