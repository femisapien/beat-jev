import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  root: "frontend",
  plugins: [react()],
  define: {
    "import.meta.env.VITE_EXAMPLE": JSON.stringify(
      ["python", "typescript"].includes(mode)
        ? mode
        : process.env.VITE_EXAMPLE || "typescript",
    ),
  },
  build: {
    outDir: `../dist/${mode === "python" ? "python" : "typescript"}`,
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5183,
    strictPort: true,
    proxy: {
      "/api": {
        target:
          process.env.VITE_EXAMPLE === "python"
            ? "http://127.0.0.1:3102"
            : "http://127.0.0.1:3101",
      },
    },
  },
}));
