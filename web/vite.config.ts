import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "push-sw.js"],
      manifest: {
        name: "Gerenciador Financeiro",
        short_name: "Finanças",
        description: "Controle suas finanças pessoais",
        lang: "pt-BR",
        theme_color: "#0f766e",
        background_color: "#f8fafc",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Nunca guardar respostas da API em cache: os dados precisam estar sempre atualizados.
        navigateFallbackDenylist: [/^\/api\//],
        // Avisos no celular (push) e toque na notificação
        importScripts: ["push-sw.js"],
      },
    }),
  ],
  server: {
    proxy: { "/api": "http://localhost:3333" },
  },
});
