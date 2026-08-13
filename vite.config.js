import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'True Herf Cigar Journal',
        short_name: 'True Herf',
        description: 'A premium cigar humidor journal for logging and reviewing every smoke.',
        start_url: '/',
        display: 'standalone',
        background_color: '#120d0a',
        theme_color: '#120d0a',
        orientation: 'portrait',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  server: {
    host: true,   // listen on 0.0.0.0 so it's reachable from your phone on the same WiFi
    port: 5173
  }
});
