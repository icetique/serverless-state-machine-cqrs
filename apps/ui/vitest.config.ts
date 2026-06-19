import { fileURLToPath, URL } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

const domainEntry = fileURLToPath(new URL('../../packages/domain/src/index.ts', import.meta.url));

export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            environment: 'jsdom',
            globals: true,
            setupFiles: './vitest.setup.ts',
            exclude: ['**/node_modules/**', '**/e2e/**'],
            coverage: {
                provider: 'v8',
                include: ['src/**/*.{ts,tsx}'],
                exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx', 'src/vite-env.d.ts'],
            },
        },
        resolve: {
            alias: {
                '@cqrs/domain': domainEntry,
            },
        },
    }),
);
