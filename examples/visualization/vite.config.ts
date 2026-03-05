import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/graphql-query-depth-limit-esm/",
  plugins: [react()],
});
