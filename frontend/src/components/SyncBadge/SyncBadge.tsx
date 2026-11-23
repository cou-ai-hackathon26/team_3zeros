import React from "react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import styles from "./SyncBadge.module.css";

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

  return (
    <div
      className={`${styles.badge} ${
        isFailed ? styles.failed : isPending ? styles.pending : styles.synced
      }`}
      role="status"
    >
      <span className={styles.indicator} aria-hidden="true">
        {isFailed ? "▪" : isPending ? "◌" : "●"}
      </span>
      <span className={styles.label}>{label}</span>
      {canRetry && (
        <button
          type="button"
          className={styles.retryButton}
          onClick={onRetrySync}
        >
          {t(locale, "action.referral.retry_sync")}
        </button>
      )}
    </div>
  );
}
