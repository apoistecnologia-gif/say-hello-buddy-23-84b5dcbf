import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ mode }) => ({
  plugins: [
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    tsconfigPaths: true,
  },
  // Production assets must remain relative because the same dist is copied into
  // the Capacitor WebView. Development keeps absolute paths for the Vite server.
  base: mode === "development" ? "/" : "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "assets",
    sourcemap: mode === "development",
    minify: mode === "production" ? "terser" : false,
  },
  server: {
    port: 8080,
    strictPort: true,
    host: true,
  },
}));
