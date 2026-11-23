import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import axe from "axe-core";
import * as product from "../components/product.stories";
import * as ui from "../components/ui/ui.stories";

// jsdom has no layout engine, so colour contrast is not checked here; contrast is
// covered by scripts/check-contrast.mjs over the token pairs. This test catches
// structural violations (names, roles, labels, landmarks) in every catalogue story.
// Every story in the catalogue is a plain `render()` function with no arguments.
type Renderable = { render?: () => React.ReactElement };
const groups = { product: product as Record<string, unknown>, ui: ui as Record<string, unknown> };

describe("component catalogue accessibility (axe)", () => {
  for (const [group, stories] of Object.entries(groups)) {
    for (const [name, story] of Object.entries(stories)) {
      if (name === "default") continue;
      it(`${group}/${name} has no axe violations`, async () => {
        const { container } = render((story as Renderable).render!());
        const results = await axe.run(container, {
          rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
        });
        expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([]);
      });
    }
  }
});
