import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { inspectAttr } from "kimi-plugin-inspect-react";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  console.log("================================");
  console.log("🚀 Vite Build");
  console.log("Mode:", mode);
  console.log("VITE_API_URL:", env.VITE_API_URL);
  console.log("================================");

  return {
    base: "./",

    plugins: [inspectAttr(), react()],

    server: {
      port: 3000,
      proxy: {
        "/api": {
          // Local development only
          target: "http://localhost:5002",
          changeOrigin: true,
        },
      },
    },

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});