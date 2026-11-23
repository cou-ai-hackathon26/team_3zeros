import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import SpecimenPage from "./page";
import tokens from "../../../../tokens/tokens.json";

describe("type specimen", () => {
  it("shows every scale step in both scripts", () => {
    const { container } = render(<SpecimenPage />);
    const steps = Object.keys(tokens.primitive.text);
    expect(steps).toHaveLength(8);
    for (const step of steps) {
      const section = container.querySelector(`[data-step="${step}"]`);
      expect(section, step).not.toBeNull();
      expect(section!.querySelector('[lang="bn"]'), `${step} bn`).not.toBeNull();
      expect(section!.querySelector('[lang="en"]'), `${step} en`).not.toBeNull();
    }
  });
});
