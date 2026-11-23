import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SessionProvider, useSession, IdleTimeoutWarning } from "./session";

function SessionProbe() {
  const { me, switchFacility } = useSession();
  return (
    <div>
      <span>{me?.display_name ?? "anonymous"}</span>
      <span>{me?.active_facility?.name ?? "no-facility"}</span>
      <button onClick={() => switchFacility("fac-2")}>Switch</button>
    </div>
  );
}

describe("FRONTEND §4 Session & Clinician Idle Timeout", () => {
  it("exposes current user and updates active facility on switchFacility", async () => {
    const onSwitch = vi.fn(async (id: string) => ({
      id,
      name: "Tangail District Hospital",
    }));
    render(
      <SessionProvider
        initialMe={{
          id: "u-1",
          display_name: "Dr. Rahima Khatun",
          email: "rahima@example.org",
          phone: null,
          preferred_language: "en",
          roles: ["clinician"],
          active_facility: { id: "fac-1", name: "Mirzapur UHC" },
          permissions: ["referral.acknowledge"],
          is_platform_admin: false,
        }}
        onSwitchFacility={onSwitch}
      >
        <SessionProbe />
      </SessionProvider>
    );
    expect(screen.getByText("Dr. Rahima Khatun")).toBeTruthy();
    expect(screen.getByText("Mirzapur UHC")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    expect(await screen.findByText("Tangail District Hospital")).toBeTruthy();
  });

  it("displays clinician idle timeout warning modal with countdown and 'Stay signed in' action (SECURITY §3.3)", () => {
    const onStay = vi.fn();
    render(<IdleTimeoutWarning secondsRemaining={120} locale="en" onStaySignedIn={onStay} onSignOut={vi.fn()} />);
    expect(screen.getByText(/120/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Stay signed in/i }));
    expect(onStay).toHaveBeenCalledTimes(1);
  });
});
