/*eslint-disable no-console */
import { promises as fs } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { stderr } from "node:process";
import { Readable } from "node:stream";
import { DOMParser, DOMImplementation, MIME_TYPE, NAMESPACE, Node } from "@xmldom/xmldom";
import chalk from "chalk";
import { glob } from "glob";
import { exec } from "tinyexec";
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
  fileName = "sprite.svg",
  iconNameTransformer = fileNameToCamelCase,
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
  });

  if (withTypes) {
    const typesOutputDir = path.dirname(typesOutputFile);
    const typesFile = path.basename(typesOutputFile);
    const typesOutputDirRelative = path.relative(cwdToUse, typesOutputDir);

    await mkdir(typesOutputDirRelative, { recursive: true });
    await generateTypes({
      names: files.map((file: string) => transformIconName(file, iconNameTransformer)),
      outputPath: path.join(typesOutputDir, typesFile),
      formatter,
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

const EXCLUDED_ATTRIBUTES = ["xmlns", "xmlns:xlink", "version", "width", "height"];
const parser = new DOMParser();
function parseSvg(input: string) {
  try {
    return parser.parseFromString(input, MIME_TYPE.XML_SVG_IMAGE);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
}

async function createSvgSymbol(file: string, inputDir: string, iconNameTransformer: (fileName: string) => string) {
  const fileName = transformIconName(file, iconNameTransformer);
  const input = await fs.readFile(path.join(inputDir, file), "utf8");

  const root = parseSvg(input);
  if (!root || !root.ownerDocument) {
    console.log(`⚠️ No SVG tag found in ${file}`);
    return;
  }
  const svg = root.documentElement;
  if (!svg) return;

  const symbol = root.ownerDocument.createElementNS(NAMESPACE.SVG, "symbol");
  symbol.setAttribute("id", fileName);

  for (const node of svg.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      symbol.appendChild(node);
    }
  }

  for (const attr of svg.attributes) {
    if (!EXCLUDED_ATTRIBUTES.includes(attr.name)) {
      symbol.setAttribute(attr.name, attr.value);
    }
  }
  return symbol;
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
}: {
  files: string[];
  inputDir: string;
  outputPath: string;
  outputDirRelative?: string;
  iconNameTransformer: (fileName: string) => string;
  /**
   * What formatter to use to format the generated files. Can be "biome" or "prettier"
   * @default no formatter
   * @example "biome"
   */
  formatter?: Formatter;
}) {
  // Each SVG becomes a symbol, and we wrap them all in a single SVG
  const xmlDoc = new DOMImplementation().createDocument(NAMESPACE.SVG, "svg");
  const defsElement = xmlDoc.createElementNS(NAMESPACE.SVG, "defs");
  if (!xmlDoc.documentElement) throw new Error("documentElement is null");
  xmlDoc.documentElement.setAttributeNS(NAMESPACE.XMLNS, "xmlns:xlink", "http://www.w3.org/1999/xlink");
  xmlDoc.documentElement.setAttribute("width", "0");
  xmlDoc.documentElement.setAttribute("height", "0");
  xmlDoc.documentElement.appendChild(defsElement);

  for (const file of files) {
    const symbol = await createSvgSymbol(file, inputDir, iconNameTransformer);
    if (symbol) defsElement.appendChild(symbol);
  }
  // eslint-disable-next-line quotes
  const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8"?>';
  const xmlString = xmlDoc.toString();
  const output = [xmlDeclaration, xmlString, ""].join("\n");
  const formattedOutput = await lintFileContent(output, formatter, "svg");

  return writeIfChanged(
    outputPath,
    formattedOutput,
    `🖼️  Generated SVG spritesheet in ${chalk.green(outputDirRelative)}`
  );
}

async function lintFileContent(fileContent: string, formatter: Formatter | undefined, typeOfFile: "ts" | "svg") {
  if (!formatter) {
    return fileContent;
  }
  // TODO biome formatter for svg (atm it doesn't work)
  if (formatter === "biome" && typeOfFile === "svg") {
    return fileContent;
  }
  const prettierOptions = ["--parser", typeOfFile === "ts" ? "typescript" : "html"];
  const biomeOptions = ["format", "--stdin-file-path", `file.${typeOfFile}`];
  const options = formatter === "biome" ? biomeOptions : prettierOptions;

  const stdinStream = new Readable();
  stdinStream.push(fileContent);
  stdinStream.push(null);

  const { process } = exec(formatter, options, {});
  if (!process?.stdin) {
    return fileContent;
  }
  stdinStream.pipe(process.stdin);
  process.stderr?.pipe(stderr);
  process.on("error", (err) => {
    //console.error(`Error running formatter process: ${err.message}`);
  });

  let formattedContent = "";
  process.stdout?.on("data", (data) => {
    formattedContent = formattedContent + data.toString();
  });
  return new Promise<string>((resolve) => {
    process.on("exit", (code) => {
      if (code === 0) {
        resolve(formattedContent);
      } else {
        resolve(fileContent);
      }
    });
  });
}

async function generateTypes({
  names,
  outputPath,
  formatter,
}: { names: string[]; outputPath: string } & Pick<PluginProps, "formatter">) {
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
  const formattedOutput = await lintFileContent(output, formatter, "ts");

  const file = await writeIfChanged(
    outputPath,
    formattedOutput,
    `${chalk.blueBright("TS")} Generated icon types in ${chalk.green(outputPath)}`
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
    const { withTypes, inputDir, outputDir, typesOutputFile, fileName, cwd, iconNameTransformer, formatter } = config;
    const iconGenerator = async () =>
      generateIcons({
        withTypes,
        inputDir,
        outputDir,
        typesOutputFile,
        fileName,
        iconNameTransformer,
        formatter,
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
        if (i > 0) {
          return;
        }

        config.build = config.build ?? {};

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
