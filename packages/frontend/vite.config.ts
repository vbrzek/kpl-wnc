import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Karty proti lidskosti',
        short_name: 'KPL',
        description: 'Online karetní party hra.',
        theme_color: '#0f0f0f',
        background_color: '#0f0f0f',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Cachuj statické assety (JS, CSS, obrázky, zvuky)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3,ogg,woff,woff2}'],
        // Navigační requesty: NetworkFirst s fallbackem na offline.html
        navigateFallback: '/offline.html',
        navigateFallbackDenylist: [
          /^\/api\//,       // REST API — vždy na server
          /^\/socket\.io/,  // Socket.io — vždy na server
          /^\/health/,      // Health check
        ],
        runtimeCaching: [
          {
            // Statické assety z CDN (DiceBear avatary)
            urlPattern: /^https:\/\/api\.dicebear\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'dicebear-avatars',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 dní
              },
            },
          },
        ],
      },
    }),
  ],
  envDir: '../../', // čti .env z kořene monorepa (ne z packages/frontend/)
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
