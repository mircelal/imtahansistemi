import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.VITE_PROXY_API ?? "http://localhost:8000";
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as { version: string };

/** Container içi Vite portu; host-da FRONTEND_HOST_PORT (məs. 3002) ilə map olunur. */
const vitePort = 3000;
const hmrClientPort = Number(
  process.env.FRONTEND_HOST_PORT || process.env.VITE_HMR_CLIENT_PORT || vitePort
);
/** Laragon localhost-u ələ keçirə bilər — 127.0.0.1 təhlükəsiz default. */
const hmrHost = process.env.VITE_HMR_HOST || "127.0.0.1";

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
    port: vitePort,
    // Docker: konteyner 3000, brauzer host portu (FRONTEND_HOST_PORT) ilə açılır.
    hmr: {
      host: hmrHost,
      port: vitePort,
      clientPort: hmrClientPort,
      protocol: "ws"
    },
    proxy: {
      // Brauzerdə /api/... → backend (JWT header saxlanılır)
      "/api": {
        target: apiTarget,
        changeOrigin: true
      }
    }
  }
});
