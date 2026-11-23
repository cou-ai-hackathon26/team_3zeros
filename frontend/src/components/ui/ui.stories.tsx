import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Bilingual } from "../../stories/Bilingual";
import { Button, LinkButton } from "./button";
import { CodeInput, Field, Input, PasswordInput, Textarea } from "./field";
import { Alert, EmptyState, ErrorState, Skeleton } from "./states";
import { DescriptionList, ListRow, PageHeader, Panel, Tile } from "./surfaces";
import { Checkbox, FilterChip, RadioGroup, RadioItem, SegmentedControl, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "./selection";
import { Table, TableCell, TableHead, TableHeaderCell, TableRow, Breadcrumb } from "./table";
import { StatusBadge } from "../StatusBadge/StatusBadge";

const meta: Meta = { title: "UI primitives" };
export default meta;
type Story = StoryObj;
const noop = () => {};

export const Buttons: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {(["primary", "secondary", "quiet", "danger"] as const).map((v) => <Button key={v} variant={v}>{v}</Button>)}
        <div className="rounded-panel bg-brand p-3"><Button variant="on-brand">on-brand</Button></div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg">Large</Button><Button size="md">Medium</Button><Button size="sm">Small</Button>
        <Button disabled>Disabled</Button><Button loading loadingLabel="Sending…">Send</Button>
        <LinkButton href="/doctors" variant="secondary">Link as button</LinkButton>
        <LinkButton href="/about" appearance="inline">Inline link</LinkButton>
      </div>
    </div>
  ),
};

export const Fields: Story = {
  render: () => (
    <Bilingual>
      {(l) => (
        <div className="grid max-w-md gap-4">
          <Field label={l === "bn" ? "ফোন নম্বর" : "Phone number"} required help={l === "bn" ? "শুধু সংখ্যা" : "Digits only"} locale={l}>{(p) => <Input {...p} />}</Field>
          <Field label={l === "bn" ? "কোড" : "Code"} error={l === "bn" ? "কোডটি সঠিক নয়" : "That code is not right"} locale={l}>{(p) => <CodeInput {...p} />}</Field>
          <Field label={l === "bn" ? "পাসওয়ার্ড" : "Password"} locale={l}>{(p) => <PasswordInput {...p} showLabel="Show" hideLabel="Hide" />}</Field>
          <Field label={l === "bn" ? "বিবরণ" : "Notes"} locale={l}>{(p) => <Textarea {...p} />}</Field>
          <Checkbox label={l === "bn" ? "রিপোর্ট শেয়ার করুন" : "Share my reports"} />
          <Switch label={l === "bn" ? "ঘোষণা" : "Notifications"} />
          <RadioGroup defaultValue="a" aria-label="Urgency"><RadioItem value="a" label="Urgent" /><RadioItem value="b" label="Routine" /></RadioGroup>
          <SegmentedControl label="Urgency" value="a" onValueChange={noop} options={[{ value: "a", label: "Emergency" }, { value: "b", label: "Urgent" }]} />
        </div>
      )}
    </Bilingual>
  ),
};

export const DataStates: Story = {
  render: () => (
    <Bilingual>
      {(l) => (
        <div className="flex max-w-xl flex-col gap-4">
          <Skeleton label={l === "bn" ? "আপনার অ্যাপয়েন্টমেন্ট লোড হচ্ছে" : "Loading your appointments"} />
          <EmptyState message={l === "bn" ? "কোনো অনুরোধ নেই। নতুন অনুরোধ এখানে দেখা যাবে।" : "No requests waiting. New requests appear here."} />
          <ErrorState message={l === "bn" ? "তালিকা লোড করা যায়নি।" : "We could not load the list."} locale={l} onRetry={noop} requestId="req-42" />
          <Alert tone="info" title="Info">One sentence.</Alert>
          <Alert tone="positive" title="Saved">One sentence.</Alert>
          <Alert tone="attention" title="Check this">One sentence.</Alert>
          <Alert tone="emergency" title="Emergency">Go to the nearest hospital.</Alert>
        </div>
      )}
    </Bilingual>
  ),
};

export const Surfaces: Story = {
  render: () => (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title="Your appointments" serif status={<StatusBadge entity="appointment" state="CONFIRMED" tone="positive" locale="en" />} context="Next visit 28 Nov" actions={<Button>New request</Button>} />
      <Panel title="Details"><DescriptionList items={[{ label: "Doctor", value: "Dr. Rahima Khatun" }, { label: "Facility", value: "Tangail District Hospital" }]} /></Panel>
      <div className="grid gap-3 sm:grid-cols-3"><Tile>Default</Tile><Tile tone="brand">Brand</Tile><Tile tone="wash" href="#">Wash link</Tile></div>
      <ul className="m-0 p-0"><ListRow title="Dr. Rahima Khatun" meta="Medicine, Tangail" trailing="Available" href="#" /><ListRow title="Dr. A. Karim" meta="Paediatrics" /></ul>
      <Breadcrumb label="Breadcrumb" items={[{ label: "Patients", href: "#" }, { label: "Karim Uddin" }]} />
    </div>
  ),
};

export const TabsAndFilters: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Tabs defaultValue="a"><TabsList><TabsTrigger value="a">Needs you</TabsTrigger><TabsTrigger value="b">Waiting</TabsTrigger></TabsList><TabsContent value="a">First panel</TabsContent><TabsContent value="b">Second panel</TabsContent></Tabs>
      <div className="flex gap-2"><FilterChip pressed>Urgent</FilterChip><FilterChip pressed={false}>Routine</FilterChip></div>
    </div>
  ),
};

export const Tables: Story = {
  render: () => (
    <Table><TableHead><TableRow><TableHeaderCell>Name</TableHeaderCell><TableHeaderCell>Slots</TableHeaderCell></TableRow></TableHead>
      <tbody><TableRow><TableCell>Dr. Rahima</TableCell><TableCell numeric>12</TableCell></TableRow></tbody></Table>
  ),
};
