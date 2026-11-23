import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Hex colours (3, 4, 6 or 8 digits, not part of a longer word or an HTML entity),
// and rgb(/rgba(/hsl(/hsla( function calls.
const COLOUR = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?)\(/g;

export function findColourLiterals(text) {
  return [...text.matchAll(COLOUR)].map((m) => ({
    literal: m[0],
    line: text.slice(0, m.index).split("\n").length,
  }));
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
  const tokensDir = path.join(root, "tokens");
  const files = [...walk(root)].filter(
    (f) => /\.(css|tsx?|mjs)$/.test(f) && !f.startsWith(tokensDir) && !/\.test\.tsx?$/.test(f) && !f.endsWith("schema.d.ts"),
  );
  const hits = files.flatMap((f) => findColourLiterals(fs.readFileSync(f, "utf8")).map((h) => ({ file: path.relative(root, f), ...h })));
  if (hits.length > 0) {
    for (const h of hits) console.error(`src/${h.file}:${h.line} colour literal ${h.literal}`);
    console.error(`lint:tokens failed: ${hits.length} colour literal(s) outside src/tokens/.`);
    process.exit(1);
  }
  console.log(`lint:tokens passed (${files.length} files).`);
}
