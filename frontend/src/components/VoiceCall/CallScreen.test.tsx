import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CallScreen } from "./CallScreen";

const base = {
  language: "en" as const,
  turns: [
    { role: "assistant" as const, text: "আপনার সমস্যা কী?", lang: "bn" as const, at: "1", translation: { text: "What is your problem?", lang: "en" as const, machine: true as const } },
  ],
  level: 0.4,
  seconds: 65,
  onMute: vi.fn(),
  onEnd: vi.fn(),
  onSwitchToText: vi.fn(),
  onFinish: vi.fn(),
  answered: 2,
  target: 7,
  max: 10,
};

describe("CallScreen", () => {
  it("shows a calling status while ringing, with no timer", () => {
    render(<CallScreen {...base} phase="ringing" />);
    expect(screen.getByRole("status")).toHaveTextContent("Calling…");
    expect(screen.queryByText("01:05")).toBeNull();
  });

  it("shows speaking status, the timer, both caption languages and the machine-translation label", () => {
    render(<CallScreen {...base} phase="speaking" />);
    expect(screen.getByRole("status")).toHaveTextContent("Speaking");
    expect(screen.getByText("01:05")).toBeInTheDocument();
    expect(screen.getByText("আপনার সমস্যা কী?")).toBeInTheDocument();
    expect(screen.getByText(/What is your problem\?/)).toBeInTheDocument();
    expect(screen.getByText("Machine translation")).toBeInTheDocument();
  });

  it("lets the patient mute, hang up and switch to typing", async () => {
    const user = userEvent.setup();
    render(<CallScreen {...base} phase="listening" />);
    await user.click(screen.getByRole("button", { name: "Mute" }));
    await user.click(screen.getByRole("button", { name: "End call" }));
    await user.click(screen.getByRole("button", { name: "Type instead" }));
    expect(base.onMute).toHaveBeenCalledWith(true);
    expect(base.onEnd).toHaveBeenCalled();
    expect(base.onSwitchToText).toHaveBeenCalled();
  });

  it("disables mute until the call is connected", () => {
    render(<CallScreen {...base} phase="ringing" />);
    expect(screen.getByRole("button", { name: "Mute" })).toBeDisabled();
  });
});

describe("CallScreen interview controls", () => {
  it("shows the question progress and lets the patient finish and see the summary", async () => {
    const user = userEvent.setup();
    render(<CallScreen {...base} phase="listening" />);
    expect(screen.getByText("Question 3 of about 7")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Finish and see summary" }));
    expect(base.onFinish).toHaveBeenCalled();
  });

  it("offers no finish button before the first answer, and never counts past the maximum", () => {
    const { rerender } = render(<CallScreen {...base} phase="listening" answered={0} />);
    expect(screen.queryByRole("button", { name: "Finish and see summary" })).toBeNull();
    expect(screen.getByText("Question 1 of about 7")).toBeInTheDocument();
    rerender(<CallScreen {...base} phase="listening" answered={25} />);
    expect(screen.getByText("Question 10 of about 7")).toBeInTheDocument();
  });
});
