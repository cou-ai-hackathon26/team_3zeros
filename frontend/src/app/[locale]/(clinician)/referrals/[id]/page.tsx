"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePageLocale } from "../../../../usePageLocale";
import { ApiError, createIntentIdempotencyKey } from "../../../../../api/client";
import { formatDhakaDateTime, formatTimeAgo, t } from "../../../../../i18n/format";
import { useReferral, useReferralDraft, useChart } from "../../../../../api/queries/hooks";
import type { Referral } from "../../../../../api/queries/types";
import { PERMISSIONS, can, hasRole } from "../../../../../auth/access";
import { useMe } from "../../../../../auth/me";
import { AssistedConsentPanel } from "../../../../../components/chw/AssistedConsentPanel";
import { ReferralSlip } from "../../../../../components/chw/ReferralSlip";
import { useCaseActions } from "../../../../../features/clinical/useCaseActions";
import { referralTone } from "../../../../../features/clinical/referralDisplay";
import { holderOf } from "../../../../../state/routes";
import { ActionBar } from "../../../../../components/ActionBar/ActionBar";
import { DraftBlock } from "../../../../../components/DraftBlock/DraftBlock";
import { HandoverTracker } from "../../../../../components/HandoverTracker/HandoverTracker";
import { QueryBoundary } from "../../../../../components/QueryBoundary";
import { StatusBadge } from "../../../../../components/StatusBadge/StatusBadge";
import { SyncBadge } from "../../../../../components/SyncBadge/SyncBadge";
import { Button } from "../../../../../components/ui/button";
import { Alert } from "../../../../../components/ui/states";
import { DescriptionList, PageHeader, Panel } from "../../../../../components/ui/surfaces";

type Sections = NonNullable<Referral["summary"]["sections"]>;

/** Section text for editing: one statement per line. */
const toText = (s: Sections[number]) => s.statements.map((x) => x.text).join("\n");
/** Back to statements, keeping each statement's source references when its line is still in place. */
function fromText(original: Sections[number], text: string): Sections[number] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return { name: original.name, statements: lines.map((l, i) => ({ text: l, source_refs: original.statements[i]?.source_refs ?? [] })) };
}

/** `/referrals/[id]`: move a referral forward as sender or receiver (APPLICATION_DESIGN §5.3). */
export default function ReferralWorkspacePage() {
  const locale = usePageLocale(undefined, "en");
  const id = String(useParams<{ id: string }>()?.id ?? "");
  const query = useReferral(id);
  const actions = useCaseActions("referrals", locale, query.refetch);
  const { save, generate } = useReferralDraft(id);
  const L = (k: string) => t(locale, `referrals.${k}`);

  const [reason, setReason] = useState("");
  const [texts, setTexts] = useState<string[]>([]);
  const [editedFor, setEditedFor] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [showSlip, setShowSlip] = useState(false);
  const { me } = useMe();
  const r = query.data;
  const chart = useChart(r?.patient_id ?? "");
  const activeMeds = chart.data?.active_medications ?? [];
  const activeAllergies = chart.data?.active_allergies ?? [];

  // Load the editable copy whenever the server version changes.
  useEffect(() => {
    if (r && editedFor !== r.version) {
      setReason(r.reason);
      setTexts((r.summary?.sections ?? []).map(toText));
      setEditedFor(r.version);
    }
  }, [r, editedFor]);

  const sections = r?.summary?.sections ?? [];
  const isDraft = r?.state === "DRAFT";
  const dirty = !!r && isDraft && (reason !== r.reason || texts.some((tx, i) => tx !== toText(sections[i])));

  async function saveDraft() {
    if (!r) return;
    setNotice(null);
    try {
      await save.mutateAsync({ reason, summary: { ...r.summary, sections: sections.map((s, i) => fromText(s, texts[i] ?? toText(s))) }, version: r.version });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 412 || e.status === 423)) await query.refetch();
      setNotice(t(locale, e instanceof ApiError ? e.i18nKey : "error.generic"));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/${locale}/referrals`} className="text-dense text-indigo underline underline-offset-2">{L("title")}</Link>
      <QueryBoundary query={query} locale={locale} loadingLabel={L("loading")} errorMessage={L("error")} notFoundMessage={L("notFound")}>
        {(ref) => {
          const holder = holderOf("referral", ref.state);
          const holderName = holder === "sender" ? ref.sender_facility_name : holder === "receiver" ? ref.receiver_facility_name : undefined;
          return (
            <>
              <PageHeader
                title={ref.patient_name}
                status={<StatusBadge entity="referral" state={ref.state} tone={referralTone(ref.state)} locale={locale} />}
                context={`${L("code")}: ${ref.reference_code}${ref.patient_system_id ? ` · ${ref.patient_system_id}` : ""}`}
                actions={
                  <Button type="button" size="sm" variant="secondary" onClick={() => setShowSlip((v) => !v)}>
                    {showSlip ? t(locale, "chw.slip.hideSlip") : t(locale, "chw.slip.showSlip")}
                  </Button>
                }
              />
              {showSlip && (
                <ReferralSlip
                  referenceCode={ref.reference_code}
                  isProvisional={false}
                  patientSystemId={ref.patient_system_id}
                  patientName={ref.patient_name}
                  sendingFacility={ref.sender_facility_name}
                  receivingFacility={ref.receiver_facility_name}
                  urgency={ref.urgency}
                  reason={ref.reason}
                  createdAt={ref.created_at}
                  locale={locale}
                />
              )}
              {(ref.state === "AWAITING_PATIENT_CONSENT" || ref.state === "CONSENT_REQUESTED") &&
                ref.consent_request_id &&
                (hasRole(me, "clinician") || can(me, PERMISSIONS.consentRecordAssisted)) && (
                  <AssistedConsentPanel
                    consentRequestId={ref.consent_request_id}
                    patientHasAccount={Boolean(ref.patient_has_account)}
                    locale={locale}
                    onRecorded={() => query.refetch()}
                  />
                )}
              <HandoverTracker entity="referral" currentState={ref.state} objectId={ref.id} locale={locale} variant="clinical" holderName={holderName} />
              {(ref.is_partial || ref.completeness_status?.toLowerCase() === "partial") && (
                <Alert
                  tone="attention"
                  title={t(locale, "receiving.partialBannerTitle")}
                >
                  <span data-testid="partial-record-banner">
                    {t(locale, "receiving.partialBannerBody")}
                    {Array.isArray(ref.missing_fields) && ref.missing_fields.length > 0
                      ? ` ${ref.missing_fields.join(", ")}`
                      : ""}
                  </span>
                </Alert>
              )}
              {!ref.is_partial && ref.reconciled_at && (
                <Alert
                  tone="info"
                  title={t(locale, "receiving.reconciledBannerTitle")}
                >
                  <span data-testid="reconciled-record-banner">
                    {t(locale, "receiving.reconciledBannerBody").replace(
                      "{at}",
                      formatDhakaDateTime(ref.reconciled_at, locale)
                    )}
                  </span>
                </Alert>
              )}
              {ref.state === "SENT" && ref.sent_at && (
                <p className="m-0 text-dense text-ink-muted">{L("waitingFor").replace("{facility}", ref.receiver_facility_name).replace("{elapsed}", formatTimeAgo(ref.sent_at, locale))}</p>
              )}
              {(ref.fhir_sync_status === "PENDING" || ref.pending_action) && <SyncBadge fhirSyncStatus="PENDING" pendingAction={ref.pending_action ?? null} locale={locale} />}
              {ref.state === "FAILED_TO_SYNC" && <Alert tone="attention" title={L("syncFailed")} />}
              {ref.consent_state === "emergency_exception_pending_policy" && <Alert tone="emergency" title={L("emergencyConsent")} />}
              {(notice || actions.notice) && <Alert tone="attention" title={notice ?? actions.notice ?? ""} />}

              <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <section aria-label={L("summary")} className="flex min-w-0 flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="m-0 text-heading font-semibold">{L("summary")}</h2>
                    {isDraft && (
                      <Button variant="secondary" size="sm" loading={generate.isPending} loadingLabel={L("generating")} onClick={() => generate.mutate(createIntentIdempotencyKey())}>
                        {L("generate")}
                      </Button>
                    )}
                  </div>
                  {isDraft && (activeMeds.length > 0 || activeAllergies.length > 0) && (
                    <div className="rounded-panel border border-line bg-sunken p-3 flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="text-dense font-bold text-ink">{t(locale, "patients.reconcileMedications")}</span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const reconciledLines: string[] = [];
                            if (activeAllergies.length > 0) {
                              reconciledLines.push(`Allergies: ${activeAllergies.map((a) => `${a.name} (${a.reaction})`).join(", ")}`);
                            }
                            if (activeMeds.length > 0) {
                              reconciledLines.push(`Medications: ${activeMeds.map((m) => `${m.name} ${m.dosage}`).join("; ")}`);
                            }
                            const addition = "\n" + reconciledLines.join("\n");
                            setReason((prev) => (prev ? prev + addition : reconciledLines.join("\n")));
                          }}
                        >
                          {t(locale, "patients.includeInReferral")}
                        </Button>
                      </div>
                      <p className="m-0 text-caption text-ink-muted">{t(locale, "patients.reconcilePrompt")}</p>
                      <div className="flex flex-wrap gap-2 text-caption">
                        {activeAllergies.map((a) => (
                          <span key={a.id} className="rounded-control border border-signal bg-signal-wash px-2 py-0.5 text-signal font-medium">
                            {a.name}
                          </span>
                        ))}
                        {activeMeds.map((m) => (
                          <span key={m.id} className="rounded-control border border-line bg-surface px-2 py-0.5 text-ink">
                            {m.name} {m.dosage}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {isDraft ? (
                    <label className="flex flex-col gap-1 text-dense font-semibold">
                      {L("reason")}
                      <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-20 rounded-control border border-line-strong bg-surface p-3 font-normal" />
                    </label>
                  ) : (
                    <p className="m-0 text-body">{ref.reason}</p>
                  )}
                  {sections.map((s, i) => (
                    <DraftBlock
                      key={`${ref.version}-${i}`}
                      title={s.name}
                      content={isDraft ? texts[i] ?? "" : toText(s)}
                      editable={isDraft}
                      onChange={(v) => setTexts((prev) => prev.map((x, j) => (j === i ? v : x)))}
                      verified={!isDraft || ref.summary_origin === "manual"}
                      locale={locale}
                      sources={[...new Set(s.statements.flatMap((x) => x.source_refs))].map((rf) => ({ id: rf, label: rf }))}
                      onOpenSource={setSource}
                    />
                  ))}
                  {source && <p role="status" className="m-0 rounded-control bg-sunken p-2 text-dense">{L("source")}: {source}</p>}
                  {isDraft && (
                    <div className="flex flex-wrap items-center gap-3">
                      <Button disabled={!dirty} loading={save.isPending} loadingLabel={L("saving")} onClick={saveDraft}>{L("save")}</Button>
                      {dirty ? <span role="status" className="text-dense text-ink-muted">{L("unsaved")}</span> : <span className="text-dense text-ink-muted">{L("editHint")}</span>}
                    </div>
                  )}
                </section>

                <aside className="flex flex-col gap-4">
                  <Panel title={L("details")}>
                    <DescriptionList items={[
                      { label: L("destination"), value: ref.receiver_facility_name },
                      { label: t(locale, "referrals.facility"), value: ref.sender_facility_name },
                      { label: L("urgency"), value: t(locale, `queue.urgency.${ref.urgency}`) },
                      { label: L("consent"), value: t(locale, `referrals.consentState.${ref.consent_state}`) },
                      { label: L("code"), value: <span className="tabular-nums">{ref.reference_code}</span> },
                    ]} />
                  </Panel>
                  <Panel title={L("history")}>
                    <ol className="m-0 flex list-none flex-col gap-2 p-0 text-caption">
                      {ref.history.map((h, i) => <li key={i}>{formatDhakaDateTime(h.at, locale)}, {h.action}{h.reason ? `: ${h.reason}` : ""}</li>)}
                    </ol>
                  </Panel>
                </aside>
              </div>

              <div className="sticky bottom-0 border-t border-line bg-paper py-3">
                <ActionBar
                  entity="referral"
                  allowedActions={ref.allowed_actions}
                  disabledActions={dirty ? ref.allowed_actions : []}
                  isPending={actions.isPending}
                  locale={locale}
                  onAction={(action, payload) => actions.run(ref, action, payload)}
                />
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
