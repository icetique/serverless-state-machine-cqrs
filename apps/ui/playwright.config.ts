import { defineConfig, devices } from '@playwright/test';

/**
 * Prerequisites (manual / pre-demo):
 * - sam local start-api on :3000 (or VITE_API_BASE_URL pointing at deployed API)
 * - npm run dev on :5173
 * - VITE_SUPABASE_* and VITE_DEMO_* env vars (see docs/supabase-setup.md)
 */
export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: 0,
    workers: 1,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:5173',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
