import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from /<repo>/
export default defineConfig({
  base: '/Dnd_character_hub/',
  plugins: [
    react(),
    VitePWA({
      // New versions install silently and apply on the next app start
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Dnd Hub',
        short_name: 'Dnd Hub',
        description: 'Листы персонажей кампании «Хвор» между сессиями',
        lang: 'ru',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#111113',
        theme_color: '#111113',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache the app shell; Supabase data will get its own offline handling in phase 3
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
})
