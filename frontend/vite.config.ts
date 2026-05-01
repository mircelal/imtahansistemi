import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.VITE_PROXY_API ?? "http://localhost:8000";
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as { version: string };

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
  },
  plugins: [react()],
  resolve: {
    // Prevent two optimized copies of react-query (breaks QueryClientProvider context).
    dedupe: ["react", "react-dom", "@tanstack/react-query"]
  },
  optimizeDeps: {
    include: ["@tanstack/react-query"]
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    // Explicit HMR endpoint avoids ws failures when host is 0.0.0.0 (Docker/LAN).
    hmr: {
      host: "localhost",
      port: 3000,
      protocol: "ws"
    },
    proxy: {
      // Brauzerdə localhost:3000/api/... → backend (JWT header saxlanılır)
      "/api": {
        target: apiTarget,
        changeOrigin: true
      }
    }
  }
});
