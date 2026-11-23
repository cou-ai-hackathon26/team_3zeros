import { describe, expect, it } from "vitest";
import { fill, humanizeCode, pickName } from "./display";

describe("display helpers", () => {
  it("humanizeCode turns backend codes into readable text and leaves real sentences alone", () => {
    expect(humanizeCode("referral_treatment")).toBe("Referral treatment");
    expect(humanizeCode("observations")).toBe("Observations");
    expect(humanizeCode("Specialist review")).toBe("Specialist review");
    expect(humanizeCode("বিশেষজ্ঞের কাছে রেফারেল")).toBe("বিশেষজ্ঞের কাছে রেফারেল");
  });
  it("pickName falls back to the other script", () => {
    expect(pickName("bn", "Dr. A", "ডা. এ")).toBe("ডা. এ");
    expect(pickName("bn", "Dr. A", "")).toBe("Dr. A");
    expect(pickName("en", "", "ডা. এ")).toBe("ডা. এ");
  });
  it("fill replaces every placeholder", () => {
    expect(fill("{a} and {a} with {b}", { a: "x", b: 2 })).toBe("x and x with 2");
  });
});
