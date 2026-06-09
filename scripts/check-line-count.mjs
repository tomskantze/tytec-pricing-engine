import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const maxLines = 300;
const ignoredDirs = new Set([".git", "dist", "node_modules"]);
const checkedExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
]);

function extensionOf(file) {
  const index = file.lastIndexOf(".");
  return index === -1 ? "" : file.slice(index);
}

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (ignoredDirs.has(entry)) return [];
      return walk(fullPath);
    }
    return checkedExtensions.has(extensionOf(entry)) ? [fullPath] : [];
  });
}

const offenders = walk(root)
  .map((file) => {
    const lines = readFileSync(file, "utf8").split(/\r?\n/).length;
    return { file, lines };
  })
  .filter(({ lines }) => lines > maxLines);

if (offenders.length) {
  offenders.forEach(({ file, lines }) => {
    console.error(`${file.replace(`${root}/`, "")}: ${lines} lines`);
  });
  process.exit(1);
}
