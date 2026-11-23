"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePageLocale } from "../../../usePageLocale";
import { t } from "../../../../i18n/format";
import { useAppointments, usePatientNames, useReferrals } from "../../../../api/queries/hooks";
import { hasRole } from "../../../../auth/access";
import { useMe } from "../../../../auth/me";
import { buildEntries, countsByTab, entriesForTab, toQueueItem, visibleTabs, type QueueTab } from "../../../../features/clinical/queue";
import { PatientPane, QueueDetail } from "../../../../components/clinical/QueueDetail";
import { QueueList } from "../../../../components/QueueList/QueueList";
import { Button } from "../../../../components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "../../../../components/ui/states";
import { PageHeader } from "../../../../components/ui/surfaces";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../../components/ui/selection";

/**
 * `/dashboard`: clear decisions quickly (APPLICATION_DESIGN §5.2). Three panes at xl, queue and
 * detail at lg, one pane at a time below. Tabs really filter; counts are plain numbers.
 */
export default function DashboardPage() {
  const locale = usePageLocale(undefined, "en");
  const { me } = useMe();
  const clinician = hasRole(me, "clinician");
  const tabs = visibleTabs(me);
  const [tab, setTab] = useState<QueueTab>("needs");
  const [selected, setSelected] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);

  const appts = useAppointments({ limit: "100", ...(clinician ? { role_view: "clinician" } : {}) });
  const incoming = useReferrals("incoming");
  const outgoing = useReferrals("outgoing");
  // The queries below depend on the user's role, so wait for the session before showing anything.
  const loading = me === undefined || appts.isLoading || incoming.isLoading || (clinician && outgoing.isLoading);
  const failed = appts.isError || incoming.isError || (clinician && outgoing.isError);

  const entries = useMemo(
    () => buildEntries(appts.data?.results ?? [], incoming.data?.results ?? [], clinician ? outgoing.data?.results ?? [] : []),
    [appts.data, incoming.data, outgoing.data, clinician],
  );
  const counts = countsByTab(entries);
  const visible = entriesForTab(entries, tab);
  const patients = usePatientNames(visible.map((e) => e.patientId));
  const items = visible.map((e) => toQueueItem(e, patients, locale));
  const current = entries.find((e) => e.key === selected) ?? null;

  // Keep a selection inside the current tab: first item by default.
  useEffect(() => {
    if (loading) return; // never lock onto a partial list
    if (visible.length && !visible.some((e) => e.key === selected)) setSelected(visible[0].key);
    if (!visible.length) setSelected(null);
  }, [visible, selected, loading]);

  const select = (key: string) => { setSelected(key); setMobileDetail(true); };
  const L = (k: string) => t(locale, `queue.${k}`);

  /** After a decision the row leaves the list and the next one is selected. */
  function afterAction() {
    const idx = visible.findIndex((e) => e.key === selected);
    const next = visible[idx + 1] ?? visible[idx - 1] ?? null;
    setSelected(next ? next.key : null);
    if (!next) setMobileDetail(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={L("title")} />
      {loading ? (
        <Skeleton label={L("loading")} />
      ) : failed ? (
        <ErrorState message={L("error")} locale={locale} onRetry={() => { appts.refetch(); incoming.refetch(); outgoing.refetch(); }} />
      ) : (
        <Tabs value={tab} onValueChange={(v) => { setTab(v as QueueTab); setMobileDetail(false); }} className="grid gap-5 lg:grid-cols-[360px_1fr] xl:grid-cols-[360px_1fr_320px]">
          <div className={mobileDetail ? "hidden lg:block" : "rounded-[20px] border border-line/80 bg-surface p-4"}>
            <TabsList className="flex-wrap">
              {tabs.map((k) => (
                <TabsTrigger key={k} value={k}>
                  {L(k)} <span className="ms-1 tabular-nums">{counts[k]}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {tabs.map((k) => (
              <TabsContent key={k} value={k} className="mt-3">
                {tab === k && (items.length === 0 ? (
                  <EmptyState message={k === "verify" ? L("emptyVerify") : L("empty")} />
                ) : (
                  <QueueList items={items} selectedId={selected} onSelect={select} locale={locale} />
                ))}
              </TabsContent>
            ))}
          </div>

          <div className={mobileDetail ? "" : "hidden lg:block"}>
            {mobileDetail && <Button variant="quiet" size="sm" className="mb-3 lg:hidden" onClick={() => setMobileDetail(false)}>{t(locale, "common.back")}</Button>}
            {current ? (
              <QueueDetail key={current.key} entry={current} patient={patients.get(current.patientId)} locale={locale} onActed={afterAction} />
            ) : (
              <div className="rounded-[20px] bg-sunken/70 p-6">
                <p className="m-0 text-dense text-ink-muted">{L("pick")}</p>
              </div>
            )}
          </div>

          <aside className="hidden xl:block">
            {current && <PatientPane patient={patients.get(current.patientId)} patientId={current.patientId} locale={locale} />}
          </aside>
        </Tabs>
      )}
    </div>
  );
}
