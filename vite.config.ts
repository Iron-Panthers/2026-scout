import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/2026-scout/" : "/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      injectRegister: false,
      manifest: {
        name: "Iron Panthers Scout - FRC Scouting",
        short_name: "Iron Panthers",
        description: "Iron Panthers FRC 5026 scouting application",
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        display: "standalone",
        orientation: "any",
        start_url: mode === "production" ? "/2026-scout/dashboard" : "/dashboard",
        scope: mode === "production" ? "/2026-scout/" : "/",
        icons: [
          {
            src: "/iron_panthers_logo.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/iron_panthers_logo.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/iron_panthers_logo.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
      devOptions: {
        enabled: true,
        type: "module",
        navigateFallback: "index.html",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
