import React from "react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { Check, Loader, TriangleAlert } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";

export interface SyncBadgeProps {
  fhirSyncStatus?: "NOT_REQUIRED" | "PENDING" | "SYNCED" | "FAILED";
  pendingAction?: string | null;
  offlineQueueState?: "QUEUED_LOCAL" | "SYNCING" | "SYNCED" | "CONFLICT" | "FAILED";
  allowedActions?: string[];
  locale: Locale;
  onRetrySync?: () => void;
}

/**
 * FRONTEND §6, §9 & MASTERPLAN §5.7-5.8 (INV-12):
 * An action is never shown as complete until its required FHIR write has succeeded.
 */
export function SyncBadge({
  fhirSyncStatus = "NOT_REQUIRED",
  pendingAction = null,
  offlineQueueState,
  allowedActions = [],
  locale,
  onRetrySync,
}: SyncBadgeProps) {
  const isFailed =
    fhirSyncStatus === "FAILED" ||
    offlineQueueState === "FAILED" ||
    offlineQueueState === "CONFLICT";
  const isPending =
    !isFailed &&
    (Boolean(pendingAction) ||
      fhirSyncStatus === "PENDING" ||
      offlineQueueState === "SYNCING" ||
      offlineQueueState === "QUEUED_LOCAL");

  const label = offlineQueueState
    ? t(locale, `state.emergency_queue.${offlineQueueState}`)
    : isFailed
      ? t(locale, "state.fhir_sync.FAILED")
      : isPending
        ? t(locale, "state.fhir_sync.PENDING")
        : t(locale, `state.fhir_sync.${fhirSyncStatus}`);

  const canRetry = isFailed && allowedActions.includes("retry_sync") && onRetrySync;

  const Icon = isFailed ? TriangleAlert : isPending ? Loader : Check;

  return (
    <div
      role="status"
      data-sync={isFailed ? "failed" : isPending ? "pending" : "synced"}
      className={cn(
        "inline-flex items-center gap-2 rounded-control border px-3 py-1 text-caption font-medium",
        isFailed
          ? "border-ochre bg-ochre-wash text-ochre"
          : isPending
            ? "border-indigo bg-indigo-wash text-ink"
            : "border-line bg-surface text-positive",
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <span>{label}</span>
      {canRetry && (
        <Button size="sm" variant="secondary" onClick={onRetrySync}>
          {t(locale, "action.referral.retry_sync")}
        </Button>
      )}
    </div>
  );
}
