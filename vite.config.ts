import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";


function requireOpenShiftMobileEnvironment() {
  const rawOrigin = process.env.APOIS_HML_GATEWAY_ORIGIN?.trim() ?? "";
  const key = process.env.APOIS_HML_PUBLIC_KEY?.trim() ?? "";
  const origin = new URL(rawOrigin);
  if (origin.origin !== rawOrigin || !/^https:\/\/apois-[a-z0-9-]+-apoistecnologia-dev\.apps\.rm3\.7wse\.p1\.openshiftapps\.com$/.test(origin.origin)) {
    throw new Error("O build HML exige a origem HTTPS do Gateway no namespace apoistecnologia-dev.");
  }

  let validPublicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  const parts = key.split(".");
  if (parts.length === 3 && /^[A-Za-z0-9_-]+$/.test(parts[1])) {
    try {
      const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      validPublicKey = claims.role === "anon" && claims.ref !== "vqtucstyduxrqjgyigfk";
    } catch {
      validPublicKey = false;
    }
  }
  if (!validPublicKey) {
    throw new Error("O build HML exige uma chave pública de homologação.");
  }
  process.env.VITE_SUPABASE_URL = origin.origin;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = key;
  return origin.origin;
}

export default defineConfig(({ mode }) => {
  requireOpenShiftMobileEnvironment();
  return {
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
  // Use relative base for Capacitor builds, absolute for development/preview
  base: mode === "capacitor" ? "./" : "/",
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
  };
});
