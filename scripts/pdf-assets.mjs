import { cpSync, mkdirSync } from "node:fs";
for (const folder of ["cmaps", "standard_fonts", "wasm"]) {
  mkdirSync("public/vendor/pdfjs", { recursive: true });
  cpSync(`node_modules/pdfjs-dist/${folder}`, `public/vendor/pdfjs/${folder}`, {
    recursive: true,
  });
}
