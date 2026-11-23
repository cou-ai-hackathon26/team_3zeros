import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { IdleTimeout } from "./IdleTimeout";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// One second at a time, so React re-renders (and schedules the next countdown tick) between timers.
const tick = (s: number) => { for (let i = 0; i < s; i++) act(() => { vi.advanceTimersByTime(1000); }); };

describe("IdleTimeout (SECURITY §3.3, AUTH_RBAC §4.3)", () => {
  it("shows nothing while the user is active", () => {
    render(<IdleTimeout locale="en" warnAfterSeconds={780} graceSeconds={120} onStay={vi.fn()} onTimeout={vi.fn()} />);
    tick(700);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("warns after the idle period with a visible countdown", () => {
    render(<IdleTimeout locale="en" warnAfterSeconds={780} graceSeconds={120} onStay={vi.fn()} onTimeout={vi.fn()} />);
    tick(780);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/in 120 seconds/)).toBeTruthy();
    tick(20);
    expect(screen.getByText(/in 100 seconds/)).toBeTruthy();
  });

  it("activity before the warning restarts the idle period", () => {
    render(<IdleTimeout locale="en" warnAfterSeconds={780} graceSeconds={120} onStay={vi.fn()} onTimeout={vi.fn()} />);
    tick(700);
    fireEvent.keyDown(document, { key: "a" });
    tick(700);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("Stay signed in calls onStay and closes the dialog", async () => {
    const onStay = vi.fn().mockResolvedValue(undefined);
    render(<IdleTimeout locale="en" warnAfterSeconds={10} graceSeconds={30} onStay={onStay} onTimeout={vi.fn()} />);
    tick(10);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Stay signed in" })); });
    expect(onStay).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("signs out when the countdown ends, and on request", () => {
    const onTimeout = vi.fn();
    const { unmount } = render(<IdleTimeout locale="en" warnAfterSeconds={10} graceSeconds={5} onStay={vi.fn()} onTimeout={onTimeout} />);
    tick(15);
    expect(onTimeout).toHaveBeenCalledOnce();
    unmount();
    const again = vi.fn();
    render(<IdleTimeout locale="bn" warnAfterSeconds={1} graceSeconds={60} onStay={vi.fn()} onTimeout={again} />);
    tick(1);
    fireEvent.click(screen.getByRole("button", { name: "সাইন আউট" }));
    expect(again).toHaveBeenCalledOnce();
  });
});
