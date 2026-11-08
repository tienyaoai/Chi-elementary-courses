import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
// GitHub Project Pages：https://<user>.github.io/<repo>/ ；本機開發維持「/」。
const base =
  process.env.VITE_BASE_PATH ??
  (process.env.GITHUB_ACTIONS === "true" && repoName ? `/${repoName}/` : "/");

// 避開常見埠，給這個小遊戲一個固定的開發埠。
export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  server: { host: "0.0.0.0", port: 4731, strictPort: true },
  preview: { host: "0.0.0.0", port: 4731, strictPort: true },
});
