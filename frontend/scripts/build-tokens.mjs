import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tokensPath = path.resolve(__dirname, "../src/tokens/tokens.json");
const outPath = path.resolve(__dirname, "../src/tokens/tokens.css");

const { primitive, semantic, component } = JSON.parse(fs.readFileSync(tokensPath, "utf8"));
const motionNames = Object.keys(primitive.motion);
const textNames = Object.keys(primitive.text);
const desktopText = textNames.filter((n) => primitive.text[n].sizeMobile !== primitive.text[n].sizeDesktop);
const bnText = textNames.filter((n) => primitive.text[n].sizeBn || primitive.text[n].lineHeightBn !== primitive.text[n].lineHeight);

const out = [];
const w = (...l) => out.push(...l);

w("/* GENERATED FROM src/tokens/tokens.json — DO NOT EDIT DIRECTLY */", "");

// Tailwind v4 theme. Each family is reset first so no default utility exists.
w("@theme {");
w("  --color-*: initial;");
for (const [k, v] of Object.entries(primitive.color)) w(`  --color-${k}: ${v};`);
w("", "  --font-*: initial;");
for (const [k, v] of Object.entries(primitive.font)) w(`  --font-${k}: ${v};`);
w("", "  --text-*: initial;");
for (const n of textNames) {
  w(`  --text-${n}: ${primitive.text[n].sizeMobile};`, `  --text-${n}--line-height: ${primitive.text[n].lineHeight};`);
}
w("", "  --radius-*: initial;");
for (const [k, v] of Object.entries(primitive.radius)) w(`  --radius-${k}: ${v};`);
w("", "  --shadow-*: initial;");
for (const [k, v] of Object.entries(primitive.shadow)) w(`  --shadow-${k}: ${v};`);
w("}", "");

// shadcn semantic layer. Utilities such as bg-background read these.
w("@theme inline {");
for (const name of Object.keys(semantic)) {
  if (!(name in primitive.color)) w(`  --color-${name}: var(--${name});`);
}
w("}", "");

w(":root {");
for (const [name, prim] of Object.entries(semantic)) w(`  --${name}: var(--color-${prim});`);
for (const [k, v] of Object.entries(component)) w(`  --${k}: ${v};`);
w("");
for (const [k, v] of Object.entries(primitive.motion)) {
  w(`  --motion-${k}-duration: ${v.duration};`, `  --motion-${k}-easing: ${v.easing};`);
}
w("}", "");

w("@media (min-width: 768px) {", "  :root {");
for (const n of desktopText) w(`    --text-${n}: ${primitive.text[n].sizeDesktop};`);
w("  }", "}", "");

w(":root:lang(bn) {");
for (const n of bnText) {
  const t = primitive.text[n];
  if (t.sizeBn) w(`  --text-${n}: ${t.sizeBn};`);
  w(`  --text-${n}--line-height: ${t.lineHeightBn};`);
}
w("}", "");

w("@media (prefers-reduced-motion: reduce) {", "  :root {");
for (const n of motionNames) w(`    --motion-${n}-duration: 0ms;`);
w("  }", "}", "");

w(
  "/* Base rules live in the base layer so Tailwind utilities (utilities layer) always win over them. */",
  "@layer base {",
  "* { box-sizing: border-box; }",
  "html, body {",
  "  margin: 0;",
  "  padding: 0;",
  "  background-color: var(--color-paper);",
  "  color: var(--color-ink);",
  "  font-family: var(--font-sans);",
  "  font-synthesis: none;",
  "  -webkit-font-smoothing: antialiased;",
  "}",
  "/* Form controls do not inherit the page font or colour by default (the part of Tailwind's reset we need). */",
  "button, input, select, textarea { font: inherit; color: inherit; }",
  "::selection {",
  "  background-color: var(--color-indigo);",
  "  color: var(--color-surface);",
  "}",
  ":focus-visible {",
  "  outline: 2px solid var(--color-indigo);",
  "  outline-offset: 2px;",
  "}",
  "}",
  "",
);

// Removed in Phase 9 together with the CSS Modules that still read these names.
w(
  "/* TEMPORARY COMPATIBILITY ALIASES (REDESIGN_IMPLEMENTATION_PLAN Phase 1, deleted in Phase 9).",
  "   Old CSS Modules still read these names; they now resolve to the new palette.",
  "   --color-paper is the warm page colour here, so old white panels render warm. */",
  ":root {",
  "  --color-mist: var(--color-paper);",
  "  --color-forest: var(--color-indigo);",
  "  --color-turmeric: var(--color-indigo);",
  "  --color-river: var(--color-indigo);",
  "  --color-draft: var(--color-ochre);",
  "  --font-numeral: var(--font-sans);",
);
for (const k of ["4", "8", "12", "16", "24", "32", "48"]) w(`  --space-${k}: ${primitive.space[k]};`);
w(
  "  --space-72: 72px;",
  "  --radius-sm: var(--radius-control);",
  "  --radius-md: var(--radius-panel);",
  "  --elevation-float: var(--shadow-float);",
  "  --motion-route-duration: var(--motion-handover-duration);",
  "  --motion-route-easing: var(--motion-handover-easing);",
  "}",
  "",
);

fs.writeFileSync(outPath, out.join("\n"), "utf8");
