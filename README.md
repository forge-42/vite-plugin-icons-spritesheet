![GitHub Repo stars](https://img.shields.io/github/stars/forge42dev/vite-plugin-icons-spritesheet?style=social)
![npm](https://img.shields.io/npm/v/vite-plugin-icons-spritesheet?style=plastic)
![GitHub](https://img.shields.io/github/license/forge42dev/vite-plugin-icons-spritesheet?style=plastic)
![npm](https://img.shields.io/npm/dy/vite-plugin-icons-spritesheet?style=plastic) 
![npm](https://img.shields.io/npm/dw/vite-plugin-icons-spritesheet?style=plastic) 
![GitHub top language](https://img.shields.io/github/languages/top/forge42dev/vite-plugin-icons-spritesheet?style=plastic) 

# vite-plugin-icons-spritesheet
A Vite plugin to generate a spritesheet with icons from a directory, re-runs on every edit/delete/add to the directory that is being watched.

Optionally generates TypeScript types for the icon names that it outputs.

If you want to learn more about this approach and it's benefits 
check it out here:
https://www.jacobparis.com/content/svg-icons

## Installation
```bash
npm install -D vite-plugin-icons-spritesheet
```

## Usage
```javascript
// vite.config.js
import { iconsSpritesheet } from 'vite-plugin-icons-spritesheet';

export default {
  plugins: [
     iconsSpritesheet({
      // Defaults to false, should it generate TS types for you
      withTypes: true,
      // The path to the icon directory
      inputDir: "icons",
      // Output path for the generated spritesheet and types
      outputDir: "public/icons",
      // Output path for the generated type file, defaults to types.ts in outputDir
      typesOutputFile: "app/icons.ts",
      // The name of the generated spritesheet, defaults to sprite.svg
      fileName: "icon.svg",
      // The cwd, defaults to process.cwd()
      cwd: process.cwd(),
      // What formatter to use to format the generated files, prettier or biome, defaults to no formatter
      formatter: "biome",
      // Callback function that is called when the script is generating the icon name
      // This is useful if you want to modify the icon name before it is written to the file
      iconNameTransformer: (iconName) => iconName
    }),
  ],
};
```

You can also pass an array of configs to the plugin to generate multiple spritesheets and types files at the same time (and watch those folders for changes).
```javascript
// vite.config.js
import { iconsSpritesheet } from 'vite-plugin-icons-spritesheet';

export default {
  plugins: [
     iconsSpritesheet([
      { 
        withTypes: true, 
        inputDir: "icons/subset1", 
        outputDir: "public/icons1", 
        typesOutputFile: "app/icons1.ts", 
        fileName: "icon1.svg", 
      },
      { 
        withTypes: true, 
        inputDir: "icons/subset2",
        outputDir: "public/icons2", 
        typesOutputFile: "app/icons2.ts", 
        fileName: "icon2.svg", 
      },
    ]),
  ],
};
```


Example component file:

```jsx
import spriteHref from "~/path/sprite.svg"
import type { SVGProps } from "react"
import type { IconName } from "~/path/types.ts"

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & {
  name: IconName
}) {
  return (
    <svg {...props}>
      <use href={`${spriteHref}#${name}`} />
    </svg>
  )
}
```

Component usage:

```jsx
<Icon name="plus" />
```
