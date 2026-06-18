import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            // Local dev only: browser calls /api/* on localhost:5173 (same origin, no CORS).
            // Vite forwards to sam local at 127.0.0.1:3000. Not used in production builds.
            '/api': {
                target: 'http://127.0.0.1:3000',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ''),
            },
        },
    },
});
