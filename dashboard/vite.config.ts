import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base so the built folder can be served from any path; every data
  // request goes through import.meta.env.BASE_URL + "data/<file>.json".
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
