import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
var domainEntry = fileURLToPath(new URL('../../packages/domain/src/index.ts', import.meta.url));
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@cqrs/domain': domainEntry,
        },
    },
    server: {
        proxy: {
            // Local dev only: browser calls /api/* on localhost:5173 (same origin, no CORS).
            // Vite forwards to sam local at 127.0.0.1:3000. Not used in production builds.
            '/api': {
                target: 'http://127.0.0.1:3000',
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/api/, ''); },
            },
        },
    },
});
