import { describe, expect, it } from "vitest";
import tokens from "./tokens.json";
import { checkAllTokenContrasts, contrastRatio } from "../../scripts/check-contrast.mjs";
import fs from "node:fs";
import path from "node:path";

describe("UIUX §3-4 Design Tokens", () => {
  it("defines exact hex values for all 11 UIUX §3.2 color tokens", () => {
    expect(tokens.color).toEqual({
      mist: "#EEF2F0",
      paper: "#FFFFFF",
      ink: "#16302A",
      "ink-muted": "#4E6660",
      line: "#CFD9D5",
      forest: "#0B5D4B",
      turmeric: "#D99A1E",
      river: "#1F5FA8",
      draft: "#6B5AA6",
      signal: "#C42B1C",
      "signal-wash": "#FBE9E7",
    });
  });

  it("meets WCAG 2.2 AA contrast thresholds for all text and UI boundary pairs", () => {
    const report = checkAllTokenContrasts(tokens.color);
    expect(report.failures).toEqual([]);
    expect(contrastRatio("#4E6660", "#FFFFFF")).toBeGreaterThanOrEqual(6.0);
    expect(contrastRatio("#16302A", "#EEF2F0")).toBeGreaterThanOrEqual(10.0);
    expect(contrastRatio("#16302A", "#FBE9E7")).toBeGreaterThanOrEqual(9.0);
  });

  it("compiles tokens.css with motion, width-axis typography, and prefers-reduced-motion rules", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "tokens.css"), "utf8");
    expect(css).toContain("--color-forest: #0B5D4B;");
    expect(css).toContain("--color-turmeric: #D99A1E;");
    expect(css).toContain("--motion-route-duration: 520ms;");
    expect(css).toContain("--motion-route-easing: cubic-bezier(.65,0,.35,1);");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
