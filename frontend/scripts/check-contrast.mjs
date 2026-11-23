import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fgHex, bgHex) {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export function checkAllTokenContrasts(colorTokens) {
  const c = colorTokens;
  const text = 4.5;
  const pairs = [
    ["ink on paper", c.ink, c.paper],
    ["ink on surface", c.ink, c.surface],
    ["ink on sunken", c.ink, c.sunken],
    ["ink-muted on paper", c["ink-muted"], c.paper],
    ["ink-muted on surface", c["ink-muted"], c.surface],
    ["ink-muted on sunken", c["ink-muted"], c.sunken],
    ["surface on indigo", c.surface, c.indigo],
    ["surface on indigo-hover", c.surface, c["indigo-hover"]],
    ["indigo on paper", c.indigo, c.paper],
    ["indigo on surface", c.indigo, c.surface],
    ["indigo on indigo-wash", c.indigo, c["indigo-wash"]],
    ["indigo on sunken", c.indigo, c.sunken],
    ["ink on indigo-wash", c.ink, c["indigo-wash"]],
    ["surface on indigo-deep", c.surface, c["indigo-deep"]],
    ["paddy on indigo-deep", c.paddy, c["indigo-deep"]],
    ["paddy on indigo", c.paddy, c.indigo],
    ["indigo-deep on paddy", c["indigo-deep"], c.paddy],
    ["positive on surface", c.positive, c.surface],
    ["positive on positive-wash", c.positive, c["positive-wash"]],
    ["ochre on surface", c.ochre, c.surface],
    ["ochre on paper", c.ochre, c.paper],
    ["ochre on ochre-wash", c.ochre, c["ochre-wash"]],
    ["signal on surface", c.signal, c.surface],
    ["signal on signal-wash", c.signal, c["signal-wash"]],
    ["surface on signal", c.surface, c.signal],
    ["ink on signal-wash", c.ink, c["signal-wash"]],
  ].map(([name, fg, bg]) => ({ name, fg, bg, min: text }));
  // Control boundaries need 3:1 (WCAG 1.4.11).
  pairs.push(
    { name: "line-strong on surface", fg: c["line-strong"], bg: c.surface, min: 3 },
    { name: "line-strong on paper", fg: c["line-strong"], bg: c.paper, min: 3 },
  );

  const results = pairs.map((p) => {
    const ratio = contrastRatio(p.fg, p.bg);
    return { ...p, ratio, pass: ratio >= p.min };
  });

  return {
    results,
    failures: results.filter((r) => !r.pass),
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const tokens = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../src/tokens/tokens.json"), "utf8"));
  const report = checkAllTokenContrasts(tokens.primitive.color);
  if (report.failures.length > 0) {
    console.error("WCAG 2.2 AA Contrast Failures:", report.failures);
    process.exit(1);
  }
  console.log(`WCAG 2.2 AA Check Passed (${report.results.length} token pairs verified).`);
}
