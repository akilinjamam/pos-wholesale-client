import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      // This project's own copy of the API contract shared with the server.
      // Kept in sync with pos-whole-sale-server/src/shared — see `npm run check:shared`.
      '@shared': new URL('./src/shared', import.meta.url).pathname,
    },
  },
  build: {
    /**
     * Vite 8 defaults to a modern baseline and emits CSS media range syntax —
     * `@media (width>=768px)` instead of `@media (min-width:768px)`.
     *
     * A browser older than Chrome 104 / Safari 16.4 / Firefox 102 does not parse that and
     * discards the ENTIRE media block. Every `md:` utility would then be dropped: the
     * desktop sidebar would stay `display:none` on desktop, and the mobile drawer overlay
     * would appear over it. Not a degraded layout — a broken one.
     *
     * This runs on whatever hardware the shop already owns, including older Android
     * tablets, so the CSS target is pinned well below that line.
     */
    cssTarget: ['chrome87', 'edge88', 'firefox78', 'safari14'],
  },
  server: {
    // 5174, so this runs alongside the retail client on 5173.
    port: 5174,
    strictPort: true,
  },
});
