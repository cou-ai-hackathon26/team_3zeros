"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePageLocale } from "../../../../usePageLocale";
import {
  useEDVisit,
  useEDVisitAction,
  useFacilityDirectory,
  asList,
} from "../../../../../api/queries/hooks";
import { t, formatDhakaDateTime } from "../../../../../i18n/format";
import { HandoverTracker } from "../../../../../components/HandoverTracker/HandoverTracker";
import {
  TriageDialog,
  AdmitDialog,
  DischargeDialog,
  TransferDialog,
} from "../../../../../components/ed/EDDialogs";
import { ConfirmDialog } from "../../../../../components/ConfirmDialog";
import { Button } from "../../../../../components/ui/button";
import { Alert, ErrorState, Skeleton } from "../../../../../components/ui/states";
import { PageHeader } from "../../../../../components/ui/surfaces";
import { useToast } from "../../../../../components/Toast/Toast";
import { cn } from "../../../../../lib/cn";
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Heart,
  Thermometer,
  Wind,
  Droplet,
  ArrowLeft,
} from "lucide-react";

function TriageBadge({ category, locale }: { category?: string | null; locale: "bn" | "en" }) {
  if (!category) return null;

  const styleMap: Record<string, string> = {
    RED: "bg-negative-wash text-negative border-negative",
    ORANGE: "bg-attention-wash text-attention border-attention",
    YELLOW: "bg-attention-wash text-ink border-attention",
    GREEN: "bg-positive-wash text-positive border-positive",
    BLUE: "bg-indigo-wash text-indigo border-indigo",
  };

  const labelMap: Record<string, string> = {
    RED: t(locale, "ed.triageRed"),
    ORANGE: t(locale, "ed.triageOrange"),
    YELLOW: t(locale, "ed.triageYellow"),
    GREEN: t(locale, "ed.triageGreen"),
    BLUE: t(locale, "ed.triageBlue"),
  };

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-control border px-2.5 py-1 text-dense font-semibold", styleMap[category] || "bg-sunken text-ink")}>
      {category === "RED" ? (
        <ShieldAlert aria-hidden className="size-4" />
      ) : category === "ORANGE" || category === "YELLOW" ? (
        <AlertTriangle aria-hidden className="size-4" />
      ) : (
        <CheckCircle2 aria-hidden className="size-4" />
      )}
      {labelMap[category] || category}
    </span>
  );
}

export default function EDVisitDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const locale = usePageLocale(undefined, "en");
  const L = (k: string) => t(locale, `ed.${k}`);
  const toast = useToast();

  const visitQuery = useEDVisit(id);
  const actionMutation = useEDVisitAction(id);
  const facilitiesQuery = useFacilityDirectory();

  const [activeDialog, setActiveDialog] = useState<"triage" | "admit" | "discharge" | "transfer" | "mark_left" | "mark_died" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visit = visitQuery.data;

  async function handleAction(actionName: string, payload?: Record<string, unknown>) {
    setError(null);
    try {
      await actionMutation.mutateAsync({
        action: actionName,
        payload,
        ifMatch: visit?.version,
      });
      setActiveDialog(null);
      toast({ message: t(locale, `toast.ed_visit.${actionName}`) });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t(locale, "error.validation_error"));
    }
  }

  if (visitQuery.isLoading) {
    return <Skeleton label={L("loading")} />;
  }

  if (visitQuery.isError || !visit) {
    return <ErrorState message={L("error")} locale={locale} onRetry={() => visitQuery.refetch()} />;
  }

  const allowed = visit.allowed_actions || [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href={`/${locale}/ed`}
          className="inline-flex items-center gap-1.5 text-dense font-medium text-ink-muted hover:text-ink no-underline mb-2"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t(locale, "common.back")}
        </Link>
        <PageHeader
          title={locale === "bn" && visit.patient_name_bn ? visit.patient_name_bn : visit.patient_name}
          context={`${visit.patient_sex ? t(locale, `ed.${visit.patient_sex}`) : ""} · ${visit.patient_phone || ""} · ${visit.facility_name}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <TriageBadge category={visit.triage_category} locale={locale} />
            </div>
          }
        />
      </div>

      {error && <Alert tone="attention" title={error} />}

      {/* Handover Route Tracker */}
      <div className="rounded-panel border border-line bg-surface p-4">
        <HandoverTracker
          entity="ed_visit"
          currentState={visit.state}
          objectId={visit.id}
          locale={locale}
          variant="clinical"
        />
      </div>

      {/* Action Bar driven strictly by allowed_actions */}
      {allowed.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-panel border border-line-strong bg-sunken p-3">
          <span className="text-dense font-semibold text-ink me-1">{t(locale, "admin.staff.actions")}:</span>
          {allowed.includes("triage") && (
            <Button variant="primary" onClick={() => { setError(null); setActiveDialog("triage"); }}>
              {t(locale, "action.ed_visit.triage")}
            </Button>
          )}
          {allowed.includes("start_care") && (
            <Button
              variant="primary"
              loading={actionMutation.isPending}
              onClick={() => handleAction("start_care")}
            >
              {t(locale, "action.ed_visit.start_care")}
            </Button>
          )}
          {allowed.includes("discharge") && (
            <Button variant="primary" onClick={() => { setError(null); setActiveDialog("discharge"); }}>
              {t(locale, "action.ed_visit.discharge")}
            </Button>
          )}
          {allowed.includes("admit") && (
            <Button variant="secondary" onClick={() => { setError(null); setActiveDialog("admit"); }}>
              {t(locale, "action.ed_visit.admit")}
            </Button>
          )}
          {allowed.includes("transfer") && (
            <Button variant="secondary" onClick={() => { setError(null); setActiveDialog("transfer"); }}>
              {t(locale, "action.ed_visit.transfer")}
            </Button>
          )}
          {allowed.includes("mark_left") && (
            <Button variant="secondary" onClick={() => { setError(null); setActiveDialog("mark_left"); }}>
              {t(locale, "action.ed_visit.mark_left")}
            </Button>
          )}
          {allowed.includes("mark_died") && (
            <Button variant="danger" onClick={() => { setError(null); setActiveDialog("mark_died"); }}>
              {t(locale, "action.ed_visit.mark_died")}
            </Button>
          )}
        </div>
      )}

      {/* Clinical Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Chief Complaint & Arrival */}
        <div className="rounded-panel border border-line bg-surface p-4 flex flex-col gap-3">
          <h2 className="m-0 text-heading font-semibold text-ink">{L("chiefComplaint")}</h2>
          <p className="m-0 text-body text-ink font-medium bg-sunken p-3 rounded-control border border-line">
            {visit.chief_complaint}
          </p>
          <div className="flex flex-wrap gap-4 text-dense text-ink-muted pt-1">
            <div>
              <span className="font-semibold text-ink">{L("arrivalMode")}: </span>
              {t(locale, `ed.${visit.arrival_mode.toLowerCase()}`)}
            </div>
            <div>
              <span className="font-semibold text-ink">{L("arrivedAt")}: </span>
              {formatDhakaDateTime(visit.arrived_at, locale)}
            </div>
          </div>
        </div>

        {/* Vital Signs / Observations */}
        <div className="rounded-panel border border-line bg-surface p-4 flex flex-col gap-3">
          <h2 className="m-0 text-heading font-semibold text-ink">{L("observations")}</h2>
          {visit.observations.length === 0 ? (
            <p className="m-0 text-dense text-ink-muted">{L("noObservations")}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {visit.observations.map((obs) => (
                <div key={obs.code} className="flex flex-col gap-1 rounded-control border border-line bg-sunken p-2.5">
                  <span className="text-caption text-ink-muted">{obs.display_name}</span>
                  <span className="text-body font-bold text-ink">
                    {obs.value_string || obs.value_numeric} <span className="text-caption font-normal text-ink-muted">{obs.unit}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Disposition / Clinical Summary (if any) */}
      {(visit.discharge_summary || visit.disposition_notes || visit.transfer_facility_name) && (
        <div className="rounded-panel border border-line bg-surface p-4 flex flex-col gap-3">
          <h2 className="m-0 text-heading font-semibold text-ink">{L("dispositionAt")}</h2>
          {visit.discharge_summary && (
            <div className="flex flex-col gap-1">
              <span className="text-dense font-semibold text-ink">{L("dischargeSummary")}:</span>
              <p className="m-0 text-body text-ink bg-sunken p-3 rounded-control border border-line">
                {visit.discharge_summary}
              </p>
            </div>
          )}
          {visit.transfer_facility_name && (
            <div>
              <span className="font-semibold text-ink">{L("destinationFacility")}: </span>
              <span className="text-body text-ink">{visit.transfer_facility_name}</span>
            </div>
          )}
          {visit.disposition_notes && (
            <div>
              <span className="font-semibold text-ink">{L("dispositionNotes")}: </span>
              <span className="text-dense text-ink-muted">{visit.disposition_notes}</span>
            </div>
          )}
        </div>
      )}

      {/* Action Dialogs */}
      {activeDialog === "triage" && (
        <TriageDialog
          locale={locale}
          busy={actionMutation.isPending}
          error={error}
          onClose={() => setActiveDialog(null)}
          onSubmit={(category, notes, vitals) =>
            handleAction("triage", { category, notes, vitals })
          }
        />
      )}

      {activeDialog === "admit" && (
        <AdmitDialog
          locale={locale}
          busy={actionMutation.isPending}
          error={error}
          onClose={() => setActiveDialog(null)}
          onSubmit={(notes) => handleAction("admit", { notes })}
        />
      )}

      {activeDialog === "discharge" && (
        <DischargeDialog
          locale={locale}
          busy={actionMutation.isPending}
          error={error}
          onClose={() => setActiveDialog(null)}
          onSubmit={(summary, notes) => handleAction("discharge", { summary, notes })}
        />
      )}

      {activeDialog === "transfer" && (
        <TransferDialog
          locale={locale}
          facilities={asList(facilitiesQuery.data)}
          busy={actionMutation.isPending}
          error={error}
          onClose={() => setActiveDialog(null)}
          onSubmit={(transferFacilityId, notes) =>
            handleAction("transfer", { transfer_facility_id: transferFacilityId, notes })
          }
        />
      )}

      {activeDialog === "mark_left" && (
        <ConfirmDialog
          title={t(locale, "action.ed_visit.mark_left")}
          description="Mark this patient as Left Without Being Seen or Left Against Medical Advice?"
          cancelLabel={t(locale, "common.close")}
          confirmLabel={t(locale, "action.ed_visit.mark_left")}
          destructive={false}
          onCancel={() => setActiveDialog(null)}
          onConfirm={() => handleAction("mark_left")}
        />
      )}

      {activeDialog === "mark_died" && (
        <ConfirmDialog
          title={t(locale, "action.ed_visit.mark_died")}
          description="Confirm recording this patient as deceased?"
          cancelLabel={t(locale, "common.close")}
          confirmLabel={t(locale, "action.ed_visit.mark_died")}
          destructive={true}
          onCancel={() => setActiveDialog(null)}
          onConfirm={() => handleAction("mark_died")}
        />
      )}
    </div>
  );
}

