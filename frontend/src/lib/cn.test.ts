import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn helper", () => {
  it("joins class names and handles conditional flags", () => {
    expect(cn("px-4", true && "py-2", false && "hidden", null, undefined)).toBe("px-4 py-2");
  });

  it("merges standard tailwind utilities correctly", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("recognizes design system type scale without merging font size away when paired with colour classes", () => {
    // text-body must not be confused with text colour
    const combined = cn("text-body", "text-destructive");
    expect(combined).toContain("text-body");
    expect(combined).toContain("text-destructive");
  });

  it("resolves conflicting custom font sizes to the latter", () => {
    expect(cn("text-body", "text-heading")).toBe("text-heading");
  });
});
