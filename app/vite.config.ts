import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // viem / wagmi が使う Node.js built-in のポリフィル
      "node:buffer": "buffer",
    },
  },
  define: {
    global: "globalThis",
  },
});
