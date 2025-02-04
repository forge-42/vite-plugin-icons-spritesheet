/*eslint-disable no-console */
import { promises as fs } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Biome, Distribution } from "@biomejs/js-api";
import chalk from "chalk";
import { glob } from "glob";
import { parse } from "node-html-parser";
import * as prettier from "prettier";
import type { Plugin } from "vite";
import { normalizePath } from "vite";

type Formatter = "biome" | "prettier";

interface PluginProps {
  /**
   * Should the plugin generate TypeScript types for the icon names
   * @default false
   */
  withTypes?: boolean;
  /**
   * The path to the icon directory
   * @example "./icons"
   */
  inputDir: string;
  /**
   * Output path for the generated
   * @example "./public/icons"
   */
  outputDir: string;
  /**
   * Output path for the generated type file
   * @example "./app/types.ts"
   */
  typesOutputFile?: string;
  /**
   * The name of the generated spritesheet
   * @default sprite.svg
   * @example "icon.svg"
   */
  fileName?: string;
  /**
   * What formatter to use to format the generated files. Can be "biome" or "prettier"
   * @default no formatter
   * @example "biome"
   */
  formatter?: Formatter;
  /**
   * The path to the formatter config file
   * @default no path
   * @example "./biome.json"
   */
  pathToFormatterConfig?: string;
  /**
   * The cwd, defaults to process.cwd()
   * @default process.cwd()
   */
  cwd?: string;
  /**
   * Callback function that is called when the script is generating the icon name
   * This is useful if you want to modify the icon name before it is written to the file
   * @example (iconName) => iconName.replace("potato", "mash-em,boil-em,put-em-in-a-stew")
   */
  iconNameTransformer?: (fileName: string) => string;
}

const generateIcons = async ({
  withTypes = false,
  inputDir,
  outputDir,
  typesOutputFile = `${outputDir}/types.ts`,
  cwd,
  formatter,
  pathToFormatterConfig,
  fileName = "sprite.svg",
  iconNameTransformer,
}: PluginProps) => {
  const cwdToUse = cwd ?? process.cwd();
  const inputDirRelative = path.relative(cwdToUse, inputDir);
  const outputDirRelative = path.relative(cwdToUse, outputDir);

  const files = glob.sync("**/*.svg", {
    cwd: inputDir,
  });
  if (files.length === 0) {
    console.log(`⚠️  No SVG files found in ${chalk.red(inputDirRelative)}`);
    return;
  }

  await mkdir(outputDirRelative, { recursive: true });
  await generateSvgSprite({
    files,
    inputDir,
    outputPath: path.join(outputDir, fileName),
    outputDirRelative,
    iconNameTransformer,
    formatter,
    pathToFormatterConfig,
  });

  if (withTypes) {
    const typesOutputDir = path.dirname(typesOutputFile);
    const typesFile = path.basename(typesOutputFile);
    const typesOutputDirRelative = path.relative(cwdToUse, typesOutputDir);

    await mkdir(typesOutputDirRelative, { recursive: true });
    await generateTypes({
      names: files.map((file: string) => transformIconName(file, iconNameTransformer ?? fileNameToCamelCase)),
      outputPath: path.join(typesOutputDir, typesFile),
      formatter,
      pathToFormatterConfig,
    });
  }
};

const transformIconName = (fileName: string, transformer: (iconName: string) => string) => {
  const iconName = fileName.replace(/\.svg$/, "");
  return transformer(iconName);
};

function fileNameToCamelCase(fileName: string): string {
  const words = fileName.split("-");
  const capitalizedWords = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return capitalizedWords.join("");
}
/**
 * Creates a single SVG file that contains all the icons
 */
async function generateSvgSprite({
  files,
  inputDir,
  outputPath,
  outputDirRelative,
  iconNameTransformer,
  formatter,
  pathToFormatterConfig,
}: {
  files: string[];
  inputDir: string;
  outputPath: string;
  outputDirRelative?: string;
  iconNameTransformer?: (fileName: string) => string;
  /**
   * What formatter to use to format the generated files. Can be "biome" or "prettier"
   * @default no formatter
   * @example "biome"
   */
  formatter?: Formatter;
  /**
   * The path to the formatter config file
   * @default no path
   * @example "./biome.json"
   */
  pathToFormatterConfig?: string;
}) {
  // Each SVG becomes a symbol and we wrap them all in a single SVG
  const symbols = await Promise.all(
    files.map(async (file) => {
      const fileName = transformIconName(file, iconNameTransformer ?? fileNameToCamelCase);
      const input = await fs.readFile(path.join(inputDir, file), "utf8");

      const root = parse(input);
      const svg = root.querySelector("svg");
      if (!svg) {
        console.log(`⚠️ No SVG tag found in ${file}`);
        return;
      }
      svg.tagName = "symbol";
      svg.setAttribute("id", fileName);
      svg.removeAttribute("xmlns");
      svg.removeAttribute("xmlns:xlink");
      svg.removeAttribute("version");
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      return svg.toString().trim();
    }),
  );
  const output = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="0" height="0">',
    "<defs>", // for semantics: https://developer.mozilla.org/en-US/docs/Web/SVG/Element/defs
    ...symbols.filter(Boolean),
    "</defs>",
    "</svg>",
  ].join("\n");
  const formattedOutput = await lintFileContent(output, formatter, pathToFormatterConfig, "svg");

  return writeIfChanged(
    outputPath,
    formattedOutput,
    `🖼️  Generated SVG spritesheet in ${chalk.green(outputDirRelative)}`,
  );
}

async function tryReadFile(path: string): Promise<string | undefined> {
  return fs.readFile(path, "utf8").catch(() => undefined);
}

function tryParseJson(json: string | undefined): Record<string, unknown> | undefined {
  if (!json) {
    return undefined;
  }
  try {
    const data = JSON.parse(json);
    return data;
  } catch (e) {
    return undefined;
  }
}

async function lintFileContent(
  fileContent: string,
  formatter: Formatter | undefined,
  pathToFormatterConfig: string | undefined,
  typeOfFile: "ts" | "svg",
) {
  if (!formatter) {
    return fileContent;
  }
  const formatterConfig = pathToFormatterConfig ? await tryReadFile(pathToFormatterConfig) : undefined;
  const formatterConfigJson = tryParseJson(formatterConfig);
  // TODO biome formatter for svg (atm it doesn't work)
  if (formatter === "biome" && typeOfFile === "ts") {
    const biome = await Biome.create({
      distribution: Distribution.NODE,
    });
    if (formatterConfigJson) {
      biome.applyConfiguration(formatterConfigJson);
    }
    return biome.formatContent(fileContent, {
      filePath: "temp.ts",
    }).content;
  }

  return prettier.format(fileContent, {
    parser: typeOfFile === "ts" ? "typescript" : "html",
    ...formatterConfigJson,
  });
}

async function generateTypes({
  names,
  outputPath,
  formatter,
  pathToFormatterConfig,
}: { names: string[]; outputPath: string } & Pick<PluginProps, "formatter" | "pathToFormatterConfig">) {
  const output = [
    "// This file is generated by icon spritesheet generator",
    "",

    "export const iconNames = [",
    ...names.map((name) => `  "${name}",`),
    "] as const",
    "",
    "export type IconName = typeof iconNames[number]",
    "",
  ].join("\n");
  const formattedOutput = await lintFileContent(output, formatter, pathToFormatterConfig, "ts");

  const file = await writeIfChanged(
    outputPath,
    formattedOutput,
    `${chalk.blueBright("TS")} Generated icon types in ${chalk.green(outputPath)}`,
  );
  return file;
}

/**
 * Each write can trigger dev server reloads
 * so only write if the content has changed
 */
async function writeIfChanged(filepath: string, newContent: string, message: string) {
  try {
    const currentContent = await fs.readFile(filepath, "utf8");
    if (currentContent !== newContent) {
      await fs.writeFile(filepath, newContent, "utf8");
      console.log(message);
    }
  } catch (e) {
    // File doesn't exist yet
    await fs.writeFile(filepath, newContent, "utf8");
    console.log(message);
  }
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const iconsSpritesheet: (args: PluginProps | PluginProps[]) => any = (maybeConfigs) => {
  const configs = Array.isArray(maybeConfigs) ? maybeConfigs : [maybeConfigs];
  const allSpriteSheetNames = configs.map((config) => config.fileName ?? "sprite.svg");
  return configs.map((config, i) => {
    const {
      withTypes,
      inputDir,
      outputDir,
      typesOutputFile,
      fileName,
      cwd,
      iconNameTransformer,
      formatter,
      pathToFormatterConfig,
    } = config;
    const iconGenerator = async () =>
      generateIcons({
        withTypes,
        inputDir,
        outputDir,
        typesOutputFile,
        fileName,
        iconNameTransformer,
        formatter,
        pathToFormatterConfig,
      });
    const workDir = cwd ?? process.cwd();
    return {
      name: `icon-spritesheet-generator${i > 0 ? i.toString() : ""}`,
      async buildStart() {
        await iconGenerator();
      },
      async watchChange(file, type) {
        const inputPath = normalizePath(path.join(workDir, inputDir));
        if (file.includes(inputPath) && file.endsWith(".svg") && ["create", "delete"].includes(type.event)) {
          await iconGenerator();
        }
      },
      async handleHotUpdate({ file }) {
        const inputPath = normalizePath(path.join(workDir, inputDir));
        if (file.includes(inputPath) && file.endsWith(".svg")) {
          await iconGenerator();
        }
      },
      async config(config) {
        if (!config.build || i > 0) {
          return;
        }
        const subFunc =
          typeof config.build.assetsInlineLimit === "function" ? config.build.assetsInlineLimit : undefined;
        const limit = typeof config.build.assetsInlineLimit === "number" ? config.build.assetsInlineLimit : undefined;

        const assetsInlineLimitFunction = (name: string, content: Buffer) => {
          const isSpriteSheet = allSpriteSheetNames.some((spriteSheetName) => {
            return name.endsWith(normalizePath(`${outputDir}/${spriteSheetName}`));
          });
          // Our spritesheet? Early return
          if (isSpriteSheet) {
            return false;
          }
          // User defined limit? Check if it's smaller than the limit
          if (limit) {
            const size = content.byteLength;
            return size <= limit;
          }
          // User defined function? Run it
          if (typeof subFunc === "function") {
            return subFunc(name, content);
          }

          return undefined;
        };
        config.build.assetsInlineLimit = assetsInlineLimitFunction;
      },
    } satisfies Plugin<unknown>;
  });
};
