import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png"],
      manifest: {
        name: "Guardian — Personal Safety",
        short_name: "Guardian",
        description: "Discreet personal safety: panic button, GPS check-ins, encrypted live sync.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0a0a0f",
        theme_color: "#0a0a0f",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "osm-tiles", expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 3600 } },
          },
        ],
      },
    }),
  ],
  server: { host: true, port: 5174 },
});
