/*
 * Purpose: Obfuscates release JavaScript after TypeScript emits dist artifacts.
 * Encapsulation: Keep publish-time code transformation here; source builds stay plain for tests and debugging.
 */

import fs from "node:fs/promises";
import path from "node:path";
import JSConfuser from "js-confuser";

const repoRoot = path.resolve(import.meta.dirname, "..");
const defaultOutputRoot = path.join(repoRoot, "dist", "src");
const outputRoots = process.argv.slice(2).map((arg) => path.resolve(arg));

const obfuscationOptions = {
  target: "node",
  preset: "low",
  renameGlobals: false,
  objectExtraction: false,
  compact: true,
  minify: true,
  preserveFunctionLength: true,
  stringConcealing: false,
  lock: {
    antiDebug: false,
    integrity: false,
    selfDefending: false,
    tamperProtection: false,
  },
};

async function jsFilesUnder(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return jsFilesUnder(entryPath);
      return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
    }),
  );

  return nestedFiles.flat().sort();
}

async function obfuscateFile(filePath) {
  const source = await fs.readFile(filePath, "utf8");
  const shebangEnd = source.startsWith("#!") ? source.indexOf("\n") : -1;
  const shebang = shebangEnd === -1 ? (source.startsWith("#!") ? source : "") : source.slice(0, shebangEnd + 1);
  const sourceBody = shebang ? source.slice(shebang.length) : source;
  if (sourceBody.trim().length === 0) {
    await fs.writeFile(filePath, shebang ? `${shebang.trimEnd()}\n` : source);
    return;
  }

  const result = await JSConfuser.obfuscate(sourceBody, obfuscationOptions);
  const code = typeof result === "string" ? result : result.code;

  await fs.writeFile(filePath, `${shebang}${code}\n`);
}

for (const outputRoot of outputRoots.length > 0 ? outputRoots : [defaultOutputRoot]) {
  const files = await jsFilesUnder(outputRoot);
  await Promise.all(files.map(obfuscateFile));
  console.log(`Obfuscated ${files.length} JavaScript files in ${path.relative(repoRoot, outputRoot) || outputRoot}`);
}
