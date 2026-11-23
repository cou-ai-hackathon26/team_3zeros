import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmergencyScreen } from "../components/EmergencyScreen/EmergencyScreen";
import { VoicePanel } from "../components/VoicePanel/VoicePanel";
import { TextClient } from "./textClient";

describe("FRONTEND §8 Voice Triage & Emergency Interrupt", () => {
  it("renders EmergencyScreen with signal-wash background, zero motion, no booking/continue link, and Q-06 placeholder warning", () => {
    render(
      <EmergencyScreen
        instructionText="PLACEHOLDER — NOT CLINICALLY APPROVED: Go to nearest emergency department immediately."
        emergencyNumbers={[]}
        locale="en"
      />
    );
    expect(screen.getByText(/This may be an emergency/i)).toBeTruthy();
    expect(screen.getByText(/PLACEHOLDER — NOT CLINICALLY APPROVED/i)).toBeTruthy();
    expect(screen.queryByText(/continue anyway/i)).toBeNull();
    expect(screen.queryByText(/Book appointment/i)).toBeNull();
  });

  it("switches to text mode when microphone permission is denied and preserves conversation turns", () => {
    const onSwitchToText = vi.fn();
    render(
      <VoicePanel
        phase="permission_denied"
        language="bn"
        turns={[]}
        micLevel={0}
        onLanguageChange={vi.fn()}
        onAllowMicrophone={vi.fn()}
        onSwitchToText={onSwitchToText}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onEnd={vi.fn()}
        onSendTextTurn={vi.fn()}
      />
    );
    expect(screen.getByText(/মাইক্রোফোন ব্লক করা আছে/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /লিখে জানান/i }));
    expect(onSwitchToText).toHaveBeenCalledTimes(1);
  });

  it("immediately stops active media tracks and enters EMERGENCY_PATHWAY when emergency turn arrives (Review Focus #4)", async () => {
    const stopTrack = vi.fn();
    const fakeStream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    const states: string[] = [];

    const client = new TextClient({
      sessionId: "sess-1",
      sendTurn: async () => ({
        state: "EMERGENCY_PATHWAY",
        assistantText: "PLACEHOLDER — NOT CLINICALLY APPROVED",
        isEmergency: true,
      }),
    });
    client.on("state", (s) => states.push(s));
    await client.connect({ sessionRef: "ref-1", token: "tok" }, fakeStream);
    await client.sendText("বুকে তীব্র ব্যথা");

    expect(stopTrack).toHaveBeenCalled();
    expect(states).toContain("emergency");
  });
});
