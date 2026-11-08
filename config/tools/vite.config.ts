import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import symfony from 'vite-plugin-symfony';

// Run from the repository root; the root is explicit so the config works wherever the file lives.
export default defineConfig({
    root: fileURLToPath(new URL('../..', import.meta.url)),
    base: '/build/',
    plugins: [symfony()],
    build: {
        // Where the plugin writes entrypoints.json and manifest.json for pentatrion/vite-bundle.
        outDir: 'public/build',
        emptyOutDir: true,
        rollupOptions: { input: { app: './assets/app.ts' } },
    },
    server: {
        // Reached through FrankenPHP (Caddy proxies /build/ here), never directly from the browser.
        host: true,
        port: 5173,
        strictPort: true,
        allowedHosts: ['vite'],
        // The root is the whole repository, and the proxy is reachable from the network: serve
        // the sources and the packages only, never composer.json, vendor/, .claude/ or secrets.
        fs: { allow: ['assets', 'node_modules'] },
        watch: {
            ignored: [
                '**/.cache/**',
                '**/vendor/**',
                '**/var/**',
                '**/public/**',
            ],
        },
        // The page's own origin: the plugin writes it into entrypoints.json, so the tags and the
        // HMR websocket go through Caddy, on https, with no mixed content.
        origin: process.env['VITE_DEV_ORIGIN'],
    },
});
