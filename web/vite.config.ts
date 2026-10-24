import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@contract": fileURLToPath(new URL("../functions/src/contract.ts", import.meta.url)),
    },
  },
  server: { port: 5173, strictPort: true, open: true },
});
