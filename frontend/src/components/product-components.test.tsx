import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { HandoverTracker } from "./HandoverTracker/HandoverTracker";
import { StatusBadge } from "./StatusBadge/StatusBadge";
import en from "../i18n/messages/en.json";
import bn from "../i18n/messages/bn.json";

describe("HandoverTracker (DESIGN_SYSTEM §6.1)", () => {
  it.each([["en", "With the receiving facility"], ["bn", "গ্রহণকারী সুবিধার কাছে"]] as const)(
    "names who holds the case in words in %s and marks exactly one current stop",
    (locale, line) => {
      render(<HandoverTracker entity="referral" currentState="SENT" objectId="r1" locale={locale} />);
      expect(screen.getByRole("region", { name: line })).toBeTruthy();
      const current = document.querySelectorAll('li[aria-current="step"]');
      // one segment and one stop inside it
      expect(current).toHaveLength(2);
    },
  );

  it("uses the holder's name when given", () => {
    render(<HandoverTracker entity="appointment" currentState="REQUESTED" objectId="a1" locale="en" holderName="Dr. Rahima Khatun" />);
    expect(screen.getByRole("region", { name: "With Dr. Rahima Khatun" })).toBeTruthy();
  });

  it("lists stops in an ordered list with a word for every stop (never colour alone)", () => {
    render(<HandoverTracker entity="referral" currentState="SENT" objectId="r2" locale="en" variant="clinical" />);
    const outer = screen.getByRole("list", { name: en.tracker.label });
    expect(within(outer).getByText(en.state.referral.DRAFT)).toBeTruthy();
    expect(within(outer).getByText(en.state.referral.SENT)).toBeTruthy();
    expect(outer.querySelectorAll("svg[aria-hidden='true']").length).toBeGreaterThan(5);
  });

  it("ends at an exception cap with a status role and says Closed when nobody holds the case", () => {
    render(<HandoverTracker entity="referral" currentState="CANCELLED" objectId="r3" locale="en" />);
    expect(screen.getByRole("status").textContent).toContain(en.state.referral.CANCELLED);
    expect(screen.getByRole("region", { name: "Closed" })).toBeTruthy();
  });

  it("uses the emergency tone only for emergency exception states", () => {
    render(<HandoverTracker entity="referral" currentState="ESCALATED" objectId="r4" locale="en" />);
    expect(screen.getByRole("status").className).toContain("signal");
  });
});

describe("StatusBadge (DESIGN_SYSTEM §6.6)", () => {
  it.each([["en", en], ["bn", bn]] as const)("renders icon plus the localized word in %s", (locale, msgs) => {
    const { container } = render(<StatusBadge entity="appointment" state="CONFIRMED" tone="positive" locale={locale} />);
    expect(screen.getByText(msgs.state.appointment.CONFIRMED)).toBeTruthy();
    expect(container.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("marks draft by a dashed border and the word, not colour alone", () => {
    const { container } = render(<StatusBadge entity="referral" state="DRAFT" tone="draft" locale="en" />);
    expect((container.firstChild as HTMLElement).className).toContain("border-dashed");
    expect(screen.getByText("Draft")).toBeTruthy();
  });
});

describe("Toaster and LanguageSwitch", () => {
  it("shows a toast from useToast with the action's verb", async () => {
    const { Toaster, useToast } = await import("./Toast/Toast");
    const { fireEvent } = await import("@testing-library/react");
    function Trigger() {
      const show = useToast();
      return <button onClick={() => show({ message: "Request accepted" })}>go</button>;
    }
    render(<Toaster><Trigger /></Toaster>);
    fireEvent.click(screen.getByText("go"));
    expect((await screen.findAllByText("Request accepted")).length).toBeGreaterThan(0);
  });

  it("LanguageSwitch is a two-option radio group that marks the current language", async () => {
    const { LanguageSwitch } = await import("./LanguageSwitch/LanguageSwitch");
    render(<LanguageSwitch locale="bn" />);
    expect(screen.getByRole("radio", { name: "বাংলা" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "English" }).getAttribute("aria-checked")).toBe("false");
  });
});
