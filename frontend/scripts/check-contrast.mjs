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
  const pairs = [
    { name: "ink on paper", fg: colorTokens.ink, bg: colorTokens.paper, min: 4.5 },
    { name: "ink on mist", fg: colorTokens.ink, bg: colorTokens.mist, min: 4.5 },
    { name: "ink-muted on paper", fg: colorTokens["ink-muted"], bg: colorTokens.paper, min: 4.5 },
    { name: "ink-muted on mist", fg: colorTokens["ink-muted"], bg: colorTokens.mist, min: 4.5 },
    { name: "paper on forest", fg: colorTokens.paper, bg: colorTokens.forest, min: 4.5 },
    { name: "forest on paper", fg: colorTokens.forest, bg: colorTokens.paper, min: 4.5 },
    { name: "river on paper", fg: colorTokens.river, bg: colorTokens.paper, min: 4.5 },
    { name: "draft on paper", fg: colorTokens.draft, bg: colorTokens.paper, min: 4.5 },
    { name: "signal on paper", fg: colorTokens.signal, bg: colorTokens.paper, min: 4.5 },
    { name: "paper on signal", fg: colorTokens.paper, bg: colorTokens.signal, min: 4.5 },
    { name: "ink on signal-wash", fg: colorTokens.ink, bg: colorTokens["signal-wash"], min: 4.5 },
  ];

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
  const report = checkAllTokenContrasts(tokens.color);
  if (report.failures.length > 0) {
    console.error("WCAG 2.2 AA Contrast Failures:", report.failures);
    process.exit(1);
  }
  console.log(`WCAG 2.2 AA Check Passed (${report.results.length} token pairs verified).`);
}
