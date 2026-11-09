import { defineConfig } from '@playwright/test';
const port = process.env.PORT || '3001';
export default defineConfig({ testDir: './tests', use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium' }, webServer: { command: 'npm start', url: `http://127.0.0.1:${port}/api/auth/session`, reuseExistingServer: true }, reporter: 'list' });
