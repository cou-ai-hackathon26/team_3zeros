"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { usePageLocale } from "../../../usePageLocale";
import { ApiError, createIntentIdempotencyKey } from "../../../../api/client";
import { t, formatDhakaDateTime, formatTimeAgo } from "../../../../i18n/format";
import { useFacilityDirectory, usePractitionerSlots, usePractitioners, useRequestAppointment, useSpecialties } from "../../../../api/queries/hooks";
import type { DirectoryFacilityEntry, DirectoryPractitioner } from "../../../../api/queries/types";
import { useMe } from "../../../../auth/me";
import { fill, pickName } from "../../../../features/patient/display";
import { AreaPicker } from "../../../../components/AreaPicker/AreaPicker";
import { Column } from "../../../../components/QueryBoundary";
import { Button, buttonVariants } from "../../../../components/ui/button";
import { Alert, EmptyState, ErrorState, Skeleton } from "../../../../components/ui/states";
import { PageHeader } from "../../../../components/ui/surfaces";
import { cn } from "../../../../lib/cn";

interface SpecialtyOption {
  code: string;
  name_en: string;
  name_bn: string;
}

function CapacityLine({ facility, locale }: { facility?: DirectoryFacilityEntry; locale: "bn" | "en" }) {
  const c = facility?.latest_capacity;
  if (!c) return null;
  // INV-14: capacity is always dated and sourced, never presented as live.
  return (
    <span className="block text-caption text-ink-muted">
      {fill(t(locale, "doctors.reported"), { ago: formatTimeAgo(c.reported_at, locale), source: c.source })}
      {c.is_stale && ` ${t(locale, "doctors.stale")}`}
    </span>
  );
}

/** One doctor. Tap to see open times, choose one, then ask for it. No tracker here: no case exists yet. */
function DoctorRow({ doctor, facilities, locale }: { doctor: DirectoryPractitioner; facilities: Map<string, DirectoryFacilityEntry>; locale: "bn" | "en" }) {
  const L = (k: string) => t(locale, `doctors.${k}`);
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const facility = doctor.facilities[0];
  const slots = usePractitionerSlots(doctor.id, facility?.id, open);
  const request = useRequestAppointment();
  const specialty = doctor.specialties.map((s) => pickName(locale, s.name_en, s.name_bn)).join(", ");
  const panelId = `doctor-${doctor.id}`;

  async function send() {
    if (!slotId || request.isPending) return;
    setMessage(null);
    try {
      const appt = await request.mutateAsync({ slotId, idempotencyKey: createIntentIdempotencyKey() });
      setSentId(appt.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === "slot_unavailable") {
        setMessage(L("taken"));
        setSlotId(null);
        await slots.refetch();
      } else {
        setMessage(L("requestError"));
      }
    }
  }

  return (
    <li className="m-0 list-none border-b border-line">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-14 w-full items-center gap-3 bg-transparent px-1 py-3 text-start"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-body font-semibold">{pickName(locale, doctor.name, doctor.name_bn)}</span>
          <span className="text-caption text-ink-muted">{[specialty, facility && pickName(locale, facility.name, facility.name_bn)].filter(Boolean).join(", ")}</span>
          <CapacityLine facility={facility && facilities.get(facility.id)} locale={locale} />
        </span>
        <ChevronDown aria-hidden className={cn("size-5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div id={panelId} className="flex flex-col gap-3 px-1 pb-4">
          {sentId ? (
            <Alert tone="positive" title={L("sent")} action={<Link href={`/${locale}/appointments/${sentId}`} className="text-indigo underline underline-offset-2">{L("viewRequest")}</Link>} />
          ) : slots.isLoading ? (
            <Skeleton label={L("loading")} />
          ) : slots.isError ? (
            <ErrorState message={L("errorSlots")} locale={locale} variant="inline" onRetry={() => slots.refetch()} />
          ) : (slots.data ?? []).filter((s) => s.state === "AVAILABLE").length === 0 ? (
            <p className="m-0 text-dense text-ink-muted">{L("noTimes")}</p>
          ) : (
            <>
              <p className="m-0 text-dense font-semibold" id={`${panelId}-label`}>{L("chooseTime")}</p>
              <div role="radiogroup" aria-labelledby={`${panelId}-label`} className="flex flex-wrap gap-2">
                {(slots.data ?? []).filter((s) => s.state === "AVAILABLE").map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={slotId === s.id}
                    onClick={() => setSlotId(s.id)}
                    className={cn("min-h-11 rounded-control border px-3 text-dense", slotId === s.id ? "border-indigo bg-indigo-wash font-semibold" : "border-line-strong bg-surface hover:bg-sunken")}
                  >
                    {formatDhakaDateTime(s.start, locale)}
                  </button>
                ))}
              </div>
              {message && <Alert tone="attention" title={message} />}
              {me === null ? (
                <Link href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/doctors`)}`} className={buttonVariants({ size: "lg", className: "w-full sm:w-fit" })}>
                  {t(locale, "shell.signIn")}
                </Link>
              ) : (
                <Button size="lg" disabled={!slotId} loading={request.isPending} loadingLabel={L("requesting")} onClick={send} className="w-full sm:w-fit">
                  {L("request")}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

/** `/doctors`: choose a doctor and a time (APPLICATION_DESIGN §4.3). Works signed out (Q-03); requesting needs sign-in. */
export default function DoctorDiscoveryPage() {
  const locale = usePageLocale(undefined, "bn");
  const L = (k: string) => t(locale, `doctors.${k}`);
  const [area, setArea] = useState<string | null>(null);
  const [specialty, setSpecialty] = useState("");
  const [pickerKey, setPickerKey] = useState(0);
  const filters = useMemo(() => ({ ...(area ? { area } : {}), ...(specialty ? { specialty } : {}) }), [area, specialty]);
  const list = usePractitioners(filters);
  const facilities = useFacilityDirectory();
  const specialties = useSpecialties();
  const facilityMap = useMemo(() => new Map((facilities.data ?? []).map((f) => [f.id, f])), [facilities.data]);
  const doctors = list.data?.pages.flatMap((p) => p.results) ?? [];
  const filtered = !!(area || specialty);

  return (
    <Column>
      <PageHeader serif title={L("title")} />
      <details className="rounded-panel border border-line bg-surface p-4" open={filtered || undefined}>
        <summary className="cursor-pointer text-dense font-semibold">{L("filters")}</summary>
        <div className="mt-4 flex flex-col gap-4">
          <AreaPicker key={pickerKey} locale={locale} onChange={setArea} />
          <label className="flex flex-col gap-1.5 text-dense font-semibold">
            {L("specialty")}
            <select value={specialty} onChange={(e) => setSpecialty(e.target.value)} className="h-12 rounded-control border border-line-strong bg-surface px-3 text-body font-normal">
              <option value="">{L("anySpecialty")}</option>
              {((specialties.data ?? []) as SpecialtyOption[]).map((s) => (
                <option key={s.code} value={s.code}>{pickName(locale, s.name_en, s.name_bn)}</option>
              ))}
            </select>
          </label>
          {filtered && (
            <Button variant="secondary" onClick={() => { setArea(null); setSpecialty(""); setPickerKey((k) => k + 1); }}>{L("clear")}</Button>
          )}
        </div>
      </details>

      {list.isLoading ? (
        <Skeleton label={L("loading")} />
      ) : list.isError ? (
        <ErrorState message={L("error")} locale={locale} onRetry={() => list.refetch()} requestId={list.error instanceof ApiError ? list.error.requestId : undefined} />
      ) : doctors.length === 0 ? (
        <EmptyState message={L("empty")} />
      ) : (
        <>
          <ul className="m-0 p-0">
            {doctors.map((d) => <DoctorRow key={d.id} doctor={d} facilities={facilityMap} locale={locale} />)}
          </ul>
          {list.hasNextPage && (
            <Button variant="secondary" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>{L("more")}</Button>
          )}
        </>
      )}
    </Column>
  );
}
