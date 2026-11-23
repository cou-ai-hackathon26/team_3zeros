"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePageLocale } from "../../../usePageLocale";
import { ApiError } from "../../../../api/client";
import { useFacilityDirectory } from "../../../../api/queries/hooks";
import { useApi } from "../../../../api/queries/provider";
import { useMe } from "../../../../auth/me";
import { normalizeDigits, t } from "../../../../i18n/format";
import { type DecryptedQueueItem, type EmergencyQueueState, type SyncTransportResult } from "../../../../offline/queue";
import { emergencyStore as store } from "../../../../offline/store";
import { EmergencySlip } from "../../../../offline/EmergencySlip";
import { SyncBadge } from "../../../../components/SyncBadge/SyncBadge";
import { Button } from "../../../../components/ui/button";
import { Field, Input, Textarea } from "../../../../components/ui/field";
import { Alert } from "../../../../components/ui/states";
import { SegmentedControl } from "../../../../components/ui/selection";
import { PageHeader } from "../../../../components/ui/surfaces";
import { pickName } from "../../../../features/patient/display";

/**
 * `/emergency`: five groups only, offline-capable (INV-16, FRONTEND §9, APPLICATION_DESIGN §5.3).
 * Saving is local first and never blocked; sending goes through the encrypted queue's transport,
 * which is idempotent, so a replay creates one referral. Nothing on this page moves.
 */
export default function EmergencyReferralPage() {
  const locale = usePageLocale(undefined, "en");
  const api = useApi();
  const { me } = useMe();
  const facilities = useFacilityDirectory();
  const L = (k: string) => t(locale, `emergencyForm.${k}`);

  const [identity, setIdentity] = useState("");
  const [reason, setReason] = useState("");
  const [urgency, setUrgency] = useState<"emergency" | "urgent">("emergency");
  const [bp, setBp] = useState("");
  const [treatment, setTreatment] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [receiverId, setReceiverId] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<DecryptedQueueItem | null>(null);
  const [queueState, setQueueState] = useState<EmergencyQueueState>("QUEUED_LOCAL");
  const [references, setReferences] = useState<Record<string, string>>({});
  const [stale, setStale] = useState(false);

  /** Sends one queued item. A non-2xx answer is returned as data so the queue can classify it (409 is a conflict). */
  const transport = useCallback(
    async (item: DecryptedQueueItem): Promise<SyncTransportResult> => {
      const receiver = item.payload.receiver_facility_id;
      if (!receiver) return { status: 400, body: { error: "receiver_missing" } }; // stays in the queue, flagged
      try {
        const res = await api.post<Record<string, unknown>>("/referrals/emergency", {
          idempotencyKey: item.idempotencyKey,
          body: {
            unverified_description: item.payload.unverified_description,
            reason: item.payload.reason,
            urgency: item.payload.urgency,
            vitals: item.payload.vitals,
            treatment_given: item.payload.treatment_given,
            facility_id: receiver,
            provisional_code: item.provisionalCode,
            idempotency_key: item.idempotencyKey,
            created_at_device: item.createdAtDevice,
          },
        });
        const code = (res.data as { reference_code?: string }).reference_code;
        if (code) setReferences((r) => ({ ...r, [item.idempotencyKey]: code }));
        return { status: res.status, body: res.data };
      } catch (e) {
        if (e instanceof ApiError) return { status: e.status, body: (e.rawBody as Record<string, unknown>) ?? {} };
        throw e; // network failure: the queue marks it for another try
      }
    },
    [api],
  );

  const refresh = useCallback(
    async (key?: string) => {
      setStale(await store.hasStaleItemsOver72Hours());
      if (!key) return;
      const item = (await store.listItems()).find((i) => i.idempotencyKey === key);
      setQueueState(item ? item.state : "SYNCED"); // a synced item is deleted locally
    },
    [],
  );

  // One sync at a time: overlapping runs would send the same item twice.
  const inflight = useRef<Promise<void> | null>(null);
  const savedKey = useRef<string | undefined>(undefined);
  const sendQueued = useCallback(
    (key?: string): Promise<void> => {
      if (inflight.current) return inflight.current;
      const run = (async () => {
        try {
          if (typeof navigator !== "undefined" && navigator.onLine === false) return; // stays QUEUED_LOCAL
          await store.syncAll(transport);
        } finally {
          inflight.current = null;
          await refresh(key ?? savedKey.current);
        }
      })();
      inflight.current = run;
      return run;
    },
    [transport, refresh],
  );

  // Retry when the connection returns, when the tab is focused again, and every 30 seconds.
  useEffect(() => {
    const run = () => { void sendQueued(); };
    run();
    window.addEventListener("online", run);
    window.addEventListener("focus", run);
    const timer = setInterval(run, 30000);
    return () => {
      window.removeEventListener("online", run);
      window.removeEventListener("focus", run);
      clearInterval(timer);
    };
  }, [sendQueued]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const bpValue = normalizeDigits(bp).trim();
      const item = await store.enqueue({
        facilityId: me?.active_facility?.id ?? "unknown",
        facilityShortCode: (me?.active_facility?.name ?? "FAC").replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase() || "FAC",
        payload: {
          unverified_description: identity.trim() || L("unconfirmed"),
          reason: reason.trim(),
          urgency,
          vitals: { recorded_at: new Date().toISOString(), items: bpValue ? [{ code: "BP", value: bpValue, unit: "mmHg" }] : [] },
          treatment_given: treatment.trim(),
          receiver_facility_id: receiverId || null,
        },
      });
      savedKey.current = item.idempotencyKey;
      setSaved(item);
      setQueueState("QUEUED_LOCAL");
      // Saving never depends on the send. If a sync is already running it may not include this item, so wait and run again.
      if (inflight.current) await inflight.current;
      await sendQueued(item.idempotencyKey);
    } finally {
      setBusy(false);
    }
  }

  const receiverName = (facilities.data ?? []).find((f) => f.id === (saved?.payload.receiver_facility_id ?? receiverId));
  const sentRef = saved ? references[saved.idempotencyKey] : undefined;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 [&_*]:!transition-none [&_*]:!animate-none">
      <PageHeader title={L("title")} context={L("help")} actions={<SyncBadge offlineQueueState={saved ? queueState : "QUEUED_LOCAL"} locale={locale} />} />
      {stale && <Alert tone="attention" title={L("staleBanner")} />}

      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field label={`1. ${L("identity")}`} help={L("identityHelp")} locale={locale}>{(p) => <Input {...p} value={identity} onChange={(e) => setIdentity(e.target.value)} />}</Field>
        <Field label={`2. ${L("reason")}`} required locale={locale}>{(p) => <Input {...p} required value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <div className="flex flex-col gap-1.5">
          <span id="em-urgency" className="text-dense font-semibold">3. {L("urgency")}</span>
          <SegmentedControl label={L("urgency")} value={urgency} onValueChange={setUrgency} options={[{ value: "emergency", label: L("emergency") }, { value: "urgent", label: L("urgent") }]} />
        </div>
        <Field label={`4. ${L("vitals")}`} locale={locale}>{(p) => <Input {...p} inputMode="numeric" value={bp} onChange={(e) => setBp(normalizeDigits(e.target.value))} />}</Field>
        <Field label={`5. ${L("treatment")}`} locale={locale}>{(p) => <Textarea {...p} value={treatment} onChange={(e) => setTreatment(e.target.value)} />}</Field>

        <Button variant="quiet" className="w-fit" aria-expanded={showMore} onClick={() => setShowMore((v) => !v)}>{L("more")}</Button>
        {showMore && (
          <Field label={L("receiver")} help={L("needReceiver")} locale={locale}>
            {(p) => (
              <select {...p} className="h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-body" value={receiverId} onChange={(e) => setReceiverId(e.target.value)}>
                <option value="">{L("chooseReceiver")}</option>
                {(facilities.data ?? []).map((f) => <option key={f.id} value={f.id}>{pickName(locale, f.name, f.name_bn)}</option>)}
              </select>
            )}
          </Field>
        )}

        <Button type="submit" variant="danger" size="lg" loading={busy} loadingLabel={L("saving")}>{L("save")}</Button>
      </form>

      {saved && (
        <section aria-label={L("slipReady")} className="flex flex-col gap-3">
          <div role="status" className="text-dense">
            {sentRef ? L("sent").replace("{code}", sentRef) : queueState === "CONFLICT" ? L("conflict") : queueState === "FAILED" ? L("failed") : queueState === "SYNCED" ? "" : L("savedLocal")}
            {!saved.payload.receiver_facility_id && queueState !== "SYNCED" && <span className="block text-ink-muted">{L("needReceiver")}</span>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-heading font-semibold">{L("slipReady")}</h2>
            <Button onClick={() => typeof window.print === "function" && window.print()}>{L("print")}</Button>
          </div>
          <EmergencySlip
            referenceCode={saved.provisionalCode}
            isProvisional
            identityText={saved.payload.unverified_description ?? L("unconfirmed")}
            reason={saved.payload.reason}
            urgency={saved.payload.urgency}
            vitals={saved.payload.vitals.items}
            vitalsRecordedAt={saved.payload.vitals.recorded_at}
            treatmentGiven={saved.payload.treatment_given}
            sendingFacility={me?.active_facility?.name ?? ""}
            receivingFacility={receiverName ? pickName(locale, receiverName.name, receiverName.name_bn) : ""}
            createdAt={saved.createdAtDevice}
            locale={locale}
          />
        </section>
      )}
    </div>
  );
}
