import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import { iconsSpritesheet } from "vite-plugin-icons-spritesheet";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    reactRouter(),
    tsconfigPaths(),
    iconsSpritesheet([
      {
        withTypes: true,
        inputDir: "icons",
        outputDir: "./app/icons",
        formatter: "prettier",
        // pathToFormatterConfig: "./biome.json",
      },
      {
        withTypes: true,
        inputDir: "icons",
        outputDir: "./public/icons",
        formatter: "biome",
        //  pathToFormatterConfig: "./biome.json",
      },
    ]),
  ],
  build: {
    assetsInlineLimit: 1024 * 1024 * 10,
  },
});
