// @ts-ignore
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { iconsSpritesheet } from "vite-plugin-icons-spritesheet";

export default defineConfig({
  plugins: [
    reactRouter(),
    tsconfigPaths(),
    iconsSpritesheet({
      withTypes: true,
      inputDir: "icons",
      outputDir: "public/icons",
    }),
  ],
});
