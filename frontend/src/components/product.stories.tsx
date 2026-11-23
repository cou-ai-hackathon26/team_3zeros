import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Bilingual } from "../stories/Bilingual";
import { HandoverTracker } from "./HandoverTracker/HandoverTracker";
import { StatusBadge, type StatusTone } from "./StatusBadge/StatusBadge";
import { SyncBadge } from "./SyncBadge/SyncBadge";
import { ActionBar } from "./ActionBar/ActionBar";
import { DraftBlock } from "./DraftBlock/DraftBlock";
import { ConsentSheet } from "./ConsentSheet/ConsentSheet";
import { QueueList } from "./QueueList/QueueList";
import { EmergencyScreen } from "./EmergencyScreen/EmergencyScreen";
import { ReportViewer } from "./ReportViewer/ReportViewer";
import { VoicePanel } from "./VoicePanel/VoicePanel";
import { Toast } from "./Toast/Toast";
import { SourceChip } from "./SourceChip/SourceChip";
import { LanguageSwitch } from "./LanguageSwitch/LanguageSwitch";

const meta: Meta = { title: "Product components" };
export default meta;
type Story = StoryObj;
const noop = () => {};

export const TrackerReferralSent: Story = {
  render: () => <Bilingual>{(l) => <HandoverTracker entity="referral" currentState="SENT" objectId="s1" locale={l} holderName="Tangail District Hospital" />}</Bilingual>,
};
export const TrackerAppointmentClinical: Story = {
  render: () => <Bilingual>{(l) => <HandoverTracker entity="appointment" currentState="REQUESTED" objectId="s2" locale={l} variant="clinical" />}</Bilingual>,
};
export const TrackerExceptionDeclined: Story = {
  render: () => <Bilingual>{(l) => <HandoverTracker entity="referral" currentState="DECLINED" objectId="s3" locale={l} />}</Bilingual>,
};
export const TrackerEmergencyEscalated: Story = {
  render: () => <Bilingual>{(l) => <HandoverTracker entity="referral" currentState="ESCALATED" objectId="s4" locale={l} variant="clinical" />}</Bilingual>,
};
export const TrackerClosed: Story = {
  render: () => <Bilingual>{(l) => <HandoverTracker entity="referral" currentState="CLOSED" objectId="s5" locale={l} />}</Bilingual>,
};

const TONES: [StatusTone, "appointment" | "referral", string][] = [
  ["neutral", "appointment", "COMPLETED"], ["active", "appointment", "REQUESTED"], ["positive", "appointment", "CONFIRMED"],
  ["draft", "referral", "DRAFT"], ["attention", "referral", "FAILED_TO_SYNC"], ["emergency", "referral", "ESCALATED"],
];
export const StatusBadges: Story = {
  render: () => <Bilingual>{(l) => <div className="flex flex-wrap gap-2">{TONES.map(([tone, e, s]) => <StatusBadge key={tone} tone={tone} entity={e} state={s} locale={l} />)}</div>}</Bilingual>,
};

export const SyncStates: Story = {
  render: () => (
    <Bilingual>
      {(l) => (
        <div className="flex flex-wrap gap-2">
          <SyncBadge fhirSyncStatus="SYNCED" locale={l} />
          <SyncBadge fhirSyncStatus="PENDING" pendingAction="send" locale={l} />
          <SyncBadge fhirSyncStatus="FAILED" allowedActions={["retry_sync"]} onRetrySync={noop} locale={l} />
        </div>
      )}
    </Bilingual>
  ),
};

export const ActionBarStates: Story = {
  render: () => (
    <Bilingual>
      {(l) => (
        <div className="flex flex-col gap-3">
          <ActionBar entity="appointment" allowedActions={["accept", "decline", "propose_alternate"]} isPending={false} locale={l} onAction={noop} />
          <ActionBar entity="appointment" allowedActions={["accept", "decline"]} isPending locale={l} onAction={noop} />
        </div>
      )}
    </Bilingual>
  ),
};

export const DraftAndVerified: Story = {
  render: () => (
    <Bilingual>
      {(l) => (
        <div className="grid gap-3 md:grid-cols-2">
          <DraftBlock title="Reason for referral" content="Persistent cough for three weeks." locale={l} sources={[{ id: "d1", label: "Report p.2" }]} onOpenSource={noop} />
          <DraftBlock title="Reason for referral" content="Persistent cough for three weeks." locale={l} verified />
        </div>
      )}
    </Bilingual>
  ),
};

export const SourceChipAndLanguage: Story = {
  render: () => <Bilingual>{(l) => <div className="flex items-center gap-4"><SourceChip source={{ id: "x", label: "Lab report, 12 Nov" }} onOpen={noop} /><LanguageSwitch locale={l} /></div>}</Bilingual>,
};

export const ConsentRequest: Story = {
  render: () => <Bilingual>{(l) => <ConsentSheet recipientPractitioner="Dr. Rahima Khatun" recipientFacility="Tangail District Hospital" purpose="Referral for chest review" categories={["Visit summary", "Lab reports"]} expiresAt="2026-12-31T00:00:00Z" locale={l} onGrant={noop} onRefuse={noop} />}</Bilingual>,
};

const QUEUE = [
  { id: "1", patientName: "Karim Uddin", patientNameBn: "করিম উদ্দিন", reason: "Fever 3d", urgency: "routine" as const, createdAt: "2026-11-22T22:00:00Z" },
  { id: "2", patientName: "Nasima Begum", patientNameBn: "নাসিমা বেগম", reason: "Chest tightness", urgency: "emergency" as const, escalated: true, createdAt: "2026-11-22T23:00:00Z" },
];
export const Queue: Story = {
  render: () => <Bilingual>{(l) => <div className="flex flex-col gap-4"><QueueList items={QUEUE} selectedId="2" onSelect={noop} locale={l} /><QueueList items={[]} onSelect={noop} locale={l} /></div>}</Bilingual>,
};

export const ToastStates: Story = {
  render: () => <div className="flex flex-col gap-2"><Toast message="Request accepted" onDismiss={noop} /><Toast tone="error" message="Could not send. Check your connection and try again." requestId="req-123" onDismiss={noop} /></div>,
};

export const Emergency: Story = {
  render: () => <Bilingual>{(l) => <EmergencyScreen instructionText="PLACEHOLDER — instruction text pending clinical approval" emergencyNumbers={[{ label: "Ambulance", phone: "999" }]} locale={l} onShowNearestFacilities={noop} />}</Bilingual>,
};

const FIELDS = [{ id: "f1", name: "Hemoglobin", value: "11.2", unit: "g/dL", observedDate: "2026-11-10", lab: "City Lab", confidence: 0.7, page: 1, bbox: [0.1, 0.2, 0.4, 0.25] as [number, number, number, number] }];
export const ReportVerification: Story = {
  render: () => <Bilingual>{(l) => <ReportViewer documentUrl="/x" filename="report.pdf" fields={FIELDS} priorResults={{ Hemoglobin: [{ value: "12.0", unit: "g/dL", date: "2026-08-01", lab: "City Lab" }] }} locale={l} onVerify={noop} onReject={noop} />}</Bilingual>,
};

const voice = (phase: React.ComponentProps<typeof VoicePanel>["phase"], l: "bn" | "en", extra: Partial<React.ComponentProps<typeof VoicePanel>> = {}) => (
  <VoicePanel phase={phase} language={l} turns={[{ role: "assistant", text: "How long have you had the fever?", lang: l, at: "2026-11-23T10:00:00Z" }]} micLevel={0.4}
    onLanguageChange={noop} onAllowMicrophone={noop} onSwitchToText={noop} onPause={noop} onResume={noop} onEnd={noop} onSendTextTurn={noop} {...extra} />
);
export const VoicePermission: Story = { render: () => <Bilingual>{(l) => voice("permission_prompt", l)}</Bilingual> };
export const VoiceDenied: Story = { render: () => <Bilingual>{(l) => voice("permission_denied", l)}</Bilingual> };
export const VoiceListening: Story = { render: () => <Bilingual>{(l) => voice("listening", l, { callSeconds: 42 })}</Bilingual> };
export const VoiceText: Story = { render: () => <Bilingual>{(l) => voice("listening", l, { textMode: true })}</Bilingual> };
