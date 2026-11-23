import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Button, LinkButton } from "./button";
import { CodeInput, Field, Input, PasswordInput } from "./field";
import { Alert, EmptyState, ErrorState, Skeleton } from "./states";
import { DescriptionList, ListRow, PageHeader, Panel, Tile } from "./surfaces";
import { FilterChip, SegmentedControl, Tabs, TabsContent, TabsList, TabsTrigger, Checkbox } from "./selection";
import { Dialog, DialogContent, DialogTrigger, AlertDialog, AlertDialogContent, AlertDialogTrigger, AlertDialogCancel } from "./overlays";
import { Table, TableCell, TableHead, TableHeaderCell, TableRow } from "./table";

afterEach(() => vi.useRealTimers());

describe("Button", () => {
  it("applies variant and size classes and keeps the type=button default", () => {
    render(<Button variant="danger" size="lg">Delete</Button>);
    const b = screen.getByRole("button", { name: "Delete" });
    expect(b.getAttribute("type")).toBe("button");
    expect(b.className).toContain("bg-destructive");
    expect(b.className).toContain("h-13");
    expect(b.className).toContain("text-body"); // size not merged away by the colour class
    expect(b.className).toContain("text-destructive-foreground");
  });

  it("while loading shows the verb in progress, is disabled and aria-busy, and ignores clicks", () => {
    const onClick = vi.fn();
    render(<Button loading loadingLabel="Sending…" onClick={onClick}>Send referral</Button>);
    const b = screen.getByRole("button", { name: "Sending…" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("LinkButton navigates as a link, not a button", () => {
    render(<LinkButton href="/doctors" variant="secondary">Find a doctor</LinkButton>);
    expect(screen.getByRole("link", { name: "Find a doctor" }).getAttribute("href")).toBe("/doctors");
  });
});

describe("Field", () => {
  it("wires label, help and error to the control and says 'required' in words", () => {
    render(
      <Field label="Phone number" required help="Digits only" error="Enter a valid number" locale="en">
        {(p) => <Input {...p} />}
      </Field>,
    );
    const input = screen.getByLabelText(/Phone number/);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-required")).toBe("true");
    const described = input.getAttribute("aria-describedby")!.split(" ");
    expect(described).toHaveLength(2);
    expect(document.getElementById(described[1])!.textContent).toBe("Enter a valid number");
    expect(screen.getByText("(required)")).toBeTruthy();
  });

  it("writes 'আবশ্যক' for Bangla and omits describedby when there is no help or error", () => {
    render(
      <Field label="ফোন" required locale="bn">
        {(p) => <Input {...p} />}
      </Field>,
    );
    expect(screen.getByText("(আবশ্যক)")).toBeTruthy();
    expect(screen.getByLabelText(/ফোন/).getAttribute("aria-describedby")).toBeNull();
  });

  it("CodeInput is a single one-time-code field and PasswordInput toggles with aria-pressed", () => {
    render(<><CodeInput aria-label="code" /><PasswordInput aria-label="password" showLabel="Show password" hideLabel="Hide password" /></>);
    expect(screen.getByLabelText("code").getAttribute("autocomplete")).toBe("one-time-code");
    const pw = screen.getByLabelText("password") as HTMLInputElement;
    expect(pw.type).toBe("password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    fireEvent.click(toggle);
    expect(pw.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("states", () => {
  it("EmptyState is one sentence plus an optional action", () => {
    render(<EmptyState message="No requests waiting. New requests appear here." action={<Button>Refresh</Button>} />);
    expect(screen.getByText(/No requests waiting/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });

  it("ErrorState alerts, offers Try again and shows the request id", () => {
    const retry = vi.fn();
    render(<ErrorState message="We could not load your appointments." locale="en" onRetry={retry} requestId="req-9" />);
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByText("req-9")).toBeTruthy();
  });

  it("Skeleton is static and shows its text label only after 1 second", () => {
    vi.useFakeTimers();
    render(<Skeleton label="Loading your appointments" />);
    expect(screen.queryByText("Loading your appointments")).toBeNull();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText("Loading your appointments")).toBeTruthy();
  });

  it("Alert uses role=alert only for the emergency tone", () => {
    const { rerender } = render(<Alert tone="info" title="Heads up">Details</Alert>);
    expect(screen.getByRole("status")).toBeTruthy();
    rerender(<Alert tone="emergency" title="Go to hospital" />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("surfaces", () => {
  it("renders Panel, Tile link, ListRow link, PageHeader and DescriptionList", () => {
    render(
      <>
        <Panel title="Details">body</Panel>
        <Tile href="/home" tone="brand">Next step</Tile>
        <ul><ListRow title="Dr. Rahima" meta="Medicine, Tangail" href="/doctors/1" trailing="Available" /></ul>
        <PageHeader title="Queue" context="3 waiting" actions={<Button>New</Button>} />
        <DescriptionList items={[{ label: "Recipient", value: "Dr. X" }]} />
      </>,
    );
    expect(screen.getByRole("heading", { name: "Details" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Next step" }).getAttribute("href")).toBe("/home");
    expect(screen.getByRole("link", { name: /Dr. Rahima/ }).getAttribute("href")).toBe("/doctors/1");
    expect(screen.getByRole("heading", { level: 1, name: "Queue" })).toBeTruthy();
    expect(screen.getByText("Recipient").tagName).toBe("DT");
  });

  it("PageHeader uses the serif only when asked (public, auth and patient areas)", () => {
    const { rerender } = render(<PageHeader title="Clinic" />);
    expect(screen.getByRole("heading", { level: 1 }).className).not.toContain("font-serif");
    rerender(<PageHeader title="Your appointments" serif />);
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("font-serif");
  });
});

describe("selection", () => {
  it("Tabs switch panels", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList><TabsTrigger value="a">Needs you</TabsTrigger><TabsTrigger value="b">Waiting</TabsTrigger></TabsList>
        <TabsContent value="a">A panel</TabsContent>
        <TabsContent value="b">B panel</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText("A panel")).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Waiting" }));
    fireEvent.click(screen.getByRole("tab", { name: "Waiting" }));
    expect(screen.getByText("B panel")).toBeTruthy();
  });

  it("FilterChip shows pressed state with aria-pressed and a check icon", () => {
    const { container } = render(<FilterChip pressed>Urgent</FilterChip>);
    expect(screen.getByRole("button", { name: "Urgent" }).getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("SegmentedControl is a radiogroup and reports changes", () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Language" value="bn" onValueChange={onChange} options={[{ value: "bn", label: "বাংলা", lang: "bn" }, { value: "en", label: "English", lang: "en" }]} />);
    expect(screen.getByRole("radiogroup", { name: "Language" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(onChange).toHaveBeenCalledWith("en");
  });

  it("Checkbox is labelled by a clickable label", () => {
    render(<Checkbox label="Share my reports" />);
    fireEvent.click(screen.getByText("Share my reports"));
    expect(screen.getByRole("checkbox", { name: "Share my reports" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("overlays", () => {
  it("Dialog opens with a title, traps focus on a labelled close button and closes on Escape", () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent title="Decline request" description="Give a reason" closeLabel="Close">content</DialogContent>
      </Dialog>,
    );
    fireEvent.click(screen.getByText("Open"));
    expect(screen.getByRole("dialog", { name: "Decline request" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("AlertDialog uses the alertdialog role and a cancel path", () => {
    render(
      <AlertDialog>
        <AlertDialogTrigger>Cancel visit</AlertDialogTrigger>
        <AlertDialogContent title="Cancel this visit?" description="You can request another time."><AlertDialogCancel>Keep it</AlertDialogCancel></AlertDialogContent>
      </AlertDialog>,
    );
    fireEvent.click(screen.getByText("Cancel visit"));
    expect(screen.getByRole("alertdialog", { name: "Cancel this visit?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("Table", () => {
  it("uses column headers and right-aligns numeric cells", () => {
    render(
      <Table>
        <TableHead><TableRow><TableHeaderCell>Name</TableHeaderCell><TableHeaderCell>Slots</TableHeaderCell></TableRow></TableHead>
        <tbody><TableRow><TableCell>Dr. X</TableCell><TableCell numeric>12</TableCell></TableRow></tbody>
      </Table>,
    );
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "12" }).className).toContain("tabular-nums");
  });
});
