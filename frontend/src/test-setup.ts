import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

// jsdom has no ResizeObserver; Radix primitives (radio group, popper) expect one.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
