import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { BlurFade } from "./BlurFade";
import { BlurText } from "./BlurText";
import { TracingBeam } from "./TracingBeam";
import { AnimatedBeam } from "./AnimatedBeam";
import { EmergencyScreen } from "../EmergencyScreen/EmergencyScreen";

describe("Phase 8 — Marketing & Animation Components (E1-E4)", () => {
  describe("E1: BlurFade", () => {
    it("renders children cleanly", () => {
      render(
        <BlurFade>
          <div>Fade Content</div>
        </BlurFade>
      );
      expect(screen.getByText("Fade Content")).toBeTruthy();
    });
  });

  describe("E2: BlurText", () => {
    it("renders accessible text and words", () => {
      const { container } = render(<BlurText text="Healthcare where you are" />);
      expect(container.textContent).toContain("Healthcare where you are");
      expect(screen.getByText("Healthcare")).toBeTruthy();
    });
  });

  describe("E3: TracingBeam", () => {
    it("renders children with beam rail container", () => {
      render(
        <TracingBeam>
          <div>Tracing Content</div>
        </TracingBeam>
      );
      expect(screen.getByText("Tracing Content")).toBeTruthy();
    });
  });

  describe("E4: AnimatedBeam", () => {
    it("renders SVG with beam paths", () => {
      const { container } = render(<AnimatedBeam />);
      expect(container.querySelector("svg")).toBeTruthy();
    });
  });

  describe("Safety constraint: Zero motion on EmergencyScreen", () => {
    it("EmergencyScreen has no motion or animation classes", () => {
      const { container } = render(
        <EmergencyScreen instructionText="Emergency help" locale="en" />
      );
      const section = container.querySelector("section");
      expect(section?.className).toContain("animate-none");
      expect(section?.className).toContain("transition-none");
    });
  });

  describe("Import boundary constraint", () => {
    it("components/marketing is only imported by landing, auth, and marketing tests", () => {
      const srcDir = path.resolve(__dirname, "../../");
      const files: string[] = [];

      function scan(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== "node_modules" && entry.name !== ".next") scan(full);
          } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
            files.push(full);
          }
        }
      }
      scan(srcDir);

      const violators: string[] = [];
      for (const f of files) {
        const content = fs.readFileSync(f, "utf8");
        if (/from ["'].*components\/marketing/g.test(content)) {
          const rel = path.relative(srcDir, f);
          const isAllowed =
            rel.startsWith("components/landing") ||
            rel.startsWith("components/marketing") ||
            rel.startsWith("components/auth") ||
            rel.startsWith("app/[locale]/(auth)");
          if (!isAllowed) {
            violators.push(rel);
          }
        }
      }
      expect(violators).toEqual([]);
    });
  });
});
