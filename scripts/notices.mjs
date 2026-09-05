import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const packages = [
  "fflate",
  "lossless-json",
  "lucide-react",
  "pdf-lib",
  "pdfjs-dist",
  "react",
  "react-dom",
  "@pdf-lib/standard-fonts",
  "@pdf-lib/upng",
  "pako",
  "tslib",
  "scheduler",
];
let output =
  "VecSpace — third-party browser distribution notices\n\nThis file describes dependency licenses, not the license of VecSpace.\nAdditional PDF.js font, CMap and Wasm notices accompany their asset directories.\n\n";
for (const name of packages) {
  const directory = `node_modules/${name}`;
  const meta = JSON.parse(readFileSync(`${directory}/package.json`, "utf8"));
  output += `${"=".repeat(72)}\n${name} ${meta.version}\nLicense identifier: ${typeof meta.license === "string" ? meta.license : JSON.stringify(meta.license)}\n\n`;
  const notices = readdirSync(directory).filter((file) =>
    /^(license|licence|notice|copying)(\.|$)/i.test(file),
  );
  if (!notices.length) throw new Error(`No license notice found for ${name}`);
  for (const file of notices)
    output += `${file}\n${readFileSync(`${directory}/${file}`, "utf8")}\n\n`;
}
writeFileSync(
  "public/THIRD_PARTY_NOTICES.txt",
  output
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trimEnd() + "\n",
);
