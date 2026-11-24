import tailwind from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/NutriTrack/' : './',
  plugins: [
    react(),
    tailwind(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        id: './',
        name: 'NutriTrack',
        short_name: 'NutriTrack',
        description: 'Osobný denník výživy a meraní.',
        lang: 'sk',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#155849',
        background_color: '#f3f5ef',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
}))
