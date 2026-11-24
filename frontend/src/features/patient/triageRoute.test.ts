import { describe, expect, it } from "vitest";
import { triageRoute } from "./triageRoute";

describe("triageRoute", () => {
  it("sends each level to its own next step", () => {
    expect(triageRoute("EMERGENCY")).toBe("emergency");
    expect(triageRoute("HIGH")).toBe("urgent");
    expect(triageRoute("MODERATE")).toBe("doctors");
    expect(triageRoute("LOW")).toBe("watch");
  });

  it("treats a missing level as see-a-doctor, never as low risk", () => {
    expect(triageRoute(null)).toBe("doctors");
    expect(triageRoute(undefined)).toBe("doctors");
  });
});
