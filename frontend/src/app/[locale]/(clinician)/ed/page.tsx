"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePageLocale } from "../../../usePageLocale";
import {
  asList,
  useEDVisits,
  useCreateEDVisit,
  useFacilityDirectory,
  type EDVisitItem,
} from "../../../../api/queries/hooks";
import { t, formatDhakaDateTime } from "../../../../i18n/format";
import { FastIntakeDialog } from "../../../../components/ed/EDDialogs";
import { Button } from "../../../../components/ui/button";
import { Alert, EmptyState, ErrorState, Skeleton } from "../../../../components/ui/states";
import { PageHeader } from "../../../../components/ui/surfaces";
import { Table, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/ui/table";
import { cn } from "../../../../lib/cn";
import { useToast } from "../../../../components/Toast/Toast";
import { ShieldAlert, AlertTriangle, Clock, CheckCircle2, Siren } from "lucide-react";

function TriageBadge({ category, locale }: { category?: EDVisitItem["triage_category"]; locale: "bn" | "en" }) {
  if (!category) return <span className="text-caption text-ink-muted">—</span>;

  const styleMap = {
    RED: "bg-negative-wash text-negative border-negative",
    ORANGE: "bg-attention-wash text-attention border-attention",
    YELLOW: "bg-attention-wash text-ink border-attention",
    GREEN: "bg-positive-wash text-positive border-positive",
    BLUE: "bg-indigo-wash text-indigo border-indigo",
  };

  const labelMap = {
    RED: t(locale, "ed.triageRed"),
    ORANGE: t(locale, "ed.triageOrange"),
    YELLOW: t(locale, "ed.triageYellow"),
    GREEN: t(locale, "ed.triageGreen"),
    BLUE: t(locale, "ed.triageBlue"),
  };

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-control border px-2 py-0.5 text-dense font-medium", styleMap[category])}>
      {category === "RED" ? (
        <ShieldAlert aria-hidden className="size-3.5" />
      ) : category === "ORANGE" || category === "YELLOW" ? (
        <AlertTriangle aria-hidden className="size-3.5" />
      ) : (
        <CheckCircle2 aria-hidden className="size-3.5" />
      )}
      {labelMap[category].split(" — ")[0]}
    </span>
  );
}

export default function EDQueuePage() {
  const locale = usePageLocale(undefined, "en");
  const L = (k: string) => t(locale, `ed.${k}`);
  const toast = useToast();
  const [tab, setTab] = useState<"active" | "all">("active");
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visitsQuery = useEDVisits(tab === "active" ? "ARRIVED,TRIAGED,UNDER_CARE" : undefined);
  const createVisit = useCreateEDVisit();
  const facilitiesQuery = useFacilityDirectory();

  const rows = asList(visitsQuery.data);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={L("title")}
        context={L("subtitle")}
        actions={
          <Button variant="primary" onClick={() => { setError(null); setRegistering(true); }}>
            <Siren aria-hidden className="size-4 me-1.5" />
            {L("registerArrival")}
          </Button>
        }
      />

      <div className="flex border-b border-line gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "active"}
          className={cn(
            "px-4 py-2 text-dense font-medium border-b-2 transition-colors",
            tab === "active" ? "border-indigo text-indigo" : "border-transparent text-ink-muted hover:text-ink"
          )}
          onClick={() => setTab("active")}
        >
          {L("tabActive")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          className={cn(
            "px-4 py-2 text-dense font-medium border-b-2 transition-colors",
            tab === "all" ? "border-indigo text-indigo" : "border-transparent text-ink-muted hover:text-ink"
          )}
          onClick={() => setTab("all")}
        >
          {L("tabAll")}
        </button>
      </div>

      {visitsQuery.isLoading ? (
        <Skeleton label={L("loading")} />
      ) : visitsQuery.isError ? (
        <ErrorState message={L("error")} locale={locale} onRetry={() => visitsQuery.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState message={L("empty")} />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{L("triageCategory")}</TableHeaderCell>
              <TableHeaderCell>{L("name")}</TableHeaderCell>
              <TableHeaderCell>{L("chiefComplaint")}</TableHeaderCell>
              <TableHeaderCell>{L("arrivalMode")}</TableHeaderCell>
              <TableHeaderCell>{L("arrivedAt")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "admin.staff.status")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "admin.staff.actions")}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <tbody>
            {rows.map((v) => {
              const stateKey = `state.ed_visit.${v.state}`;
              return (
                <TableRow key={v.id}>
                  <TableCell>
                    <TriageBadge category={v.triage_category} locale={locale} />
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold">
                      {locale === "bn" && v.patient_name_bn ? v.patient_name_bn : v.patient_name}
                    </div>
                    <div className="text-dense text-ink-muted">
                      {[v.patient_sex ? t(locale, `ed.${v.patient_sex}`) : null, v.patient_phone].filter(Boolean).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs truncate font-medium">
                    {v.chief_complaint}
                  </TableCell>
                  <TableCell className="text-dense text-ink-muted">
                    {t(locale, `ed.${v.arrival_mode.toLowerCase()}`)}
                  </TableCell>
                  <TableCell className="text-dense text-ink-muted whitespace-nowrap">
                    {formatDhakaDateTime(v.arrived_at, locale)}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 rounded-control bg-sunken px-2 py-0.5 text-dense font-medium text-ink">
                      <Clock aria-hidden className="size-3.5" />
                      {t(locale, stateKey)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/${locale}/ed/${v.id}`}
                      className="inline-flex items-center justify-center rounded-control border border-line px-3 py-1 text-dense font-semibold text-indigo hover:bg-indigo-wash no-underline"
                    >
                      {L("openVisit")}
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
      )}

      {registering && (
        <FastIntakeDialog
          locale={locale}
          facilities={asList(facilitiesQuery.data)}
          busy={createVisit.isPending}
          error={error}
          onClose={() => setRegistering(false)}
          onSubmit={async (val) => {
            setError(null);
            try {
              await createVisit.mutateAsync(val);
              setRegistering(false);
              toast({ message: L("registerArrival") });
            } catch (err: unknown) {
              setError(err instanceof Error ? err.message : t(locale, "error.validation_error"));
            }
          }}
        />
      )}
    </div>
  );
}

