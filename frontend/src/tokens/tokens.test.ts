import { describe, expect, it } from "vitest";
import tokens from "./tokens.json";
import { checkAllTokenContrasts, contrastRatio } from "../../scripts/check-contrast.mjs";
import { findColourLiterals } from "../../scripts/lint-tokens.mjs";
import fs from "node:fs";
import path from "node:path";

const css = fs.readFileSync(path.resolve(__dirname, "tokens.css"), "utf8");
const colour = tokens.primitive.color;

describe("Design system tokens (DESIGN_SYSTEM §2, §5)", () => {
  it("defines the 18 primitive colours exactly", () => {
    expect(colour).toEqual({
      paper: "#FAF7F2",
      surface: "#FFFFFF",
      sunken: "#F1ECE3",
      ink: "#1A1B2E",
      "ink-muted": "#55586E",
      line: "#DAD3C6",
      "line-strong": "#8A8577",
      indigo: "#2A3990",
      "indigo-hover": "#212D75",
      "indigo-deep": "#151A45",
      "indigo-wash": "#E9ECFA",
      paddy: "#B9E36B",
      positive: "#1D6B45",
      "positive-wash": "#E3F3EA",
      ochre: "#8A5A00",
      "ochre-wash": "#FBF1DC",
      signal: "#C42B1C",
      "signal-wash": "#FBE9E7",
    });
  });

  it("every semantic token points at an existing primitive", () => {
    for (const [name, primitive] of Object.entries(tokens.semantic)) {
      expect(colour, `${name} -> ${primitive}`).toHaveProperty(primitive as string);
    }
  });

  it("meets every pair in the DESIGN_SYSTEM §2.2 table", () => {
    const report = checkAllTokenContrasts(colour);
    expect(report.failures).toEqual([]);
    expect(report.results.length).toBeGreaterThanOrEqual(25);
    expect(contrastRatio(colour.ink, colour.paper)).toBeGreaterThanOrEqual(15);
    expect(contrastRatio(colour["line-strong"], colour.surface)).toBeGreaterThanOrEqual(3);
  });

  it("keeps paddy off light backgrounds (forbidden pairing)", () => {
    expect(contrastRatio(colour.paddy, colour.surface)).toBeLessThan(3);
  });

  it("generates a Tailwind v4 theme with the default palette removed", () => {
    expect(css).toContain("@theme {");
    expect(css).toContain("--color-*: initial;");
    expect(css).toContain("--color-indigo: #2A3990;");
    expect(css).toContain("--color-paddy: #B9E36B;");
    expect(css).toContain("--font-serif:");
    expect(css).toContain("--radius-control: 6px;");
    expect(css).toContain("--radius-tile: 16px;");
  });

  it("emits shadcn semantic variables", () => {
    expect(css).toContain("--background: var(--color-paper);");
    expect(css).toContain("--primary: var(--color-indigo);");
    expect(css).toContain("--ring: var(--color-indigo);");
    expect(css).toContain("--draft: var(--color-ochre);");
  });

  it("emits motion tokens and a reduced-motion override", () => {
    expect(css).toContain("--motion-handover-duration: 480ms;");
    expect(css).toContain("--motion-reveal-duration: 400ms;");
    expect(css).toContain("--motion-page-duration: 240ms;");
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*--motion-handover-duration: 0ms;/);
  });

  it("marks the old variable names as temporary compatibility aliases", () => {
    expect(css).toContain("TEMPORARY COMPATIBILITY ALIASES");
    expect(css).toContain("--color-forest: var(--color-indigo);");
    expect(css).toContain("--color-mist: var(--color-paper);");
    expect(css).toContain("--space-12: 12px;");
  });

  it("does not use faux bold for the serif face", () => {
    expect(css).toContain("font-synthesis: none;");
  });
});

describe("lint:tokens", () => {
  it("flags hex, rgb() and hsl() colour literals", () => {
    const hits = findColourLiterals(
      'a { color: #fff; background: rgb(0 0 0); border-color: hsl(1 2% 3%); }\nconst c = "bg-[#16302A]";',
    );
    expect(hits.map((h) => h.literal)).toEqual(["#fff", "rgb(", "hsl(", "#16302A"]);
  });

  it("ignores non-colour text such as CSS ids and anchors", () => {
    expect(findColourLiterals('href="#main" id="#abc-x" // issue #123456789')).toEqual([]);
  });
});
