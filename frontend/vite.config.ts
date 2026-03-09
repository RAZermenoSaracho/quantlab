import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.PORT) || 4173,
    allowedHosts: true
  },
  resolve: {
    alias: {
      "@quantlab/contracts": path.resolve(
        __dirname,
        "../packages/contracts/src"
      ),
    },
  },
});
