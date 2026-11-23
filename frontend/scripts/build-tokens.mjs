import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tokensPath = path.resolve(__dirname, "../src/tokens/tokens.json");
const outPath = path.resolve(__dirname, "../src/tokens/tokens.css");

const tokens = JSON.parse(fs.readFileSync(tokensPath, "utf8"));

const lines = [
  "/* GENERATED FROM src/tokens/tokens.json — DO NOT EDIT DIRECTLY */",
  ":root {",
];

for (const [k, v] of Object.entries(tokens.color)) {
  lines.push(`  --color-${k}: ${v};`);
}

lines.push(`  --font-sans: ${tokens.typography.fontFamily};`);
lines.push(`  --font-numeral: ${tokens.typography.numeralFallback};`);

for (const [k, v] of Object.entries(tokens.space)) {
  lines.push(`  --space-${k}: ${v};`);
}

for (const [k, v] of Object.entries(tokens.radius)) {
  lines.push(`  --radius-${k}: ${v};`);
}

lines.push(`  --elevation-float: ${tokens.elevation.float};`);

for (const [k, v] of Object.entries(tokens.motion)) {
  lines.push(`  --motion-${k}-duration: ${v.duration};`);
  lines.push(`  --motion-${k}-easing: ${v.easing};`);
}

lines.push("}");
lines.push("");
lines.push("@media (prefers-reduced-motion: reduce) {");
lines.push("  :root {");
lines.push("    --motion-feedback-duration: 0ms;");
lines.push("    --motion-state-duration: 0ms;");
lines.push("    --motion-route-duration: 0ms;");
lines.push("    --motion-page-duration: 0ms;");
lines.push("  }");
lines.push("}");
lines.push("");
lines.push("* { box-sizing: border-box; }");
lines.push("html, body {");
lines.push("  margin: 0;");
lines.push("  padding: 0;");
lines.push("  background-color: var(--color-mist);");
lines.push("  color: var(--color-ink);");
lines.push("  font-family: var(--font-sans);");
lines.push("  -webkit-font-smoothing: antialiased;");
lines.push("}");
lines.push("::selection {");
lines.push("  background-color: var(--color-forest);");
lines.push("  color: var(--color-paper);");
lines.push("}");
lines.push(":focus-visible {");
lines.push("  outline: 2px solid var(--color-ink);");
lines.push("  box-shadow: 0 0 0 4px var(--color-turmeric);");
lines.push("}");
lines.push("");

fs.writeFileSync(outPath, lines.join("\n"), "utf8");
