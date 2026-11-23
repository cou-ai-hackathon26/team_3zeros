"use client";

import React, { useState } from "react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { getActionDefinition, type StatefulEntity } from "../../state/actions";
import { createIntentIdempotencyKey } from "../../api/client";
import styles from "./ActionBar.module.css";

export interface ActionPayload {
  reason?: string;
  alternateSlotId?: string;
  idempotencyKey: string;
}

export interface ActionBarProps {
  entity: StatefulEntity;
  allowedActions: string[];
  isPending: boolean;
  locale: Locale;
  onAction: (action: string, payload: ActionPayload) => void;
}

/**
 * FRONTEND §5-6 & UIUX §5:
 * - Renders strictly the actions present in allowed_actions.
 * - Throws if an action in allowed_actions lacks a configuration in ACTION_REGISTRY.
 * - Generates a single Idempotency-Key per user intent and disables buttons while pending.
 * - Opens a reason sheet when MASTERPLAN requires a reason (e.g., decline, close_with_exception).
 */
export function ActionBar({
  entity,
  allowedActions,
  isPending,
  locale,
  onAction,
}: ActionBarProps) {
  const [activeReasonAction, setActiveReasonAction] = useState<string | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [activeSlotAction, setActiveSlotAction] = useState<string | null>(null);
  const [alternateSlotId, setAlternateSlotId] = useState("");
  const [intentKeyMap, setIntentKeyMap] = useState<Record<string, string>>({});

  if (allowedActions.length === 0) {
    return null;
  }

  const definitions = allowedActions.map((act) => getActionDefinition(entity, act));

  function getOrMintIntentKey(action: string): string {
    if (intentKeyMap[action]) {
      return intentKeyMap[action];
    }
    const key = createIntentIdempotencyKey();
    setIntentKeyMap((prev) => ({ ...prev, [action]: key }));
    return key;
  }

  function handleActionClick(action: string, requiresReason: boolean, requiresAlternateSlot?: boolean) {
    const key = getOrMintIntentKey(action);
    if (requiresReason) {
      setActiveReasonAction(action);
      setReasonText("");
      return;
    }
    if (requiresAlternateSlot) {
      setActiveSlotAction(action);
      setAlternateSlotId("");
      return;
    }
    onAction(action, { idempotencyKey: key });
  }

  function handleConfirmReason(e: React.FormEvent) {
    e.preventDefault();
    if (!activeReasonAction || !reasonText.trim()) return;
    const key = getOrMintIntentKey(activeReasonAction);
    onAction(activeReasonAction, {
      reason: reasonText.trim(),
      idempotencyKey: key,
    });
    setActiveReasonAction(null);
    setReasonText("");
  }

  return (
    <div className={styles.bar}>
      <div className={styles.buttonGroup}>
        {definitions.map((def) => (
          <button
            key={def.action}
            type="button"
            disabled={isPending}
            className={`${styles.button} ${styles[def.confirmationStyle]}`}
            onClick={() => handleActionClick(def.action, def.requiresReason, def.requiresAlternateSlot)}
          >
            {t(locale, def.labelKey)}
          </button>
        ))}
      </div>

      {activeSlotAction && (
        <form
          className={styles.reasonSheet}
          onSubmit={(e) => {
            e.preventDefault();
            if (!alternateSlotId.trim()) return;
            onAction(activeSlotAction, {
              alternateSlotId: alternateSlotId.trim(),
              idempotencyKey: getOrMintIntentKey(activeSlotAction),
            });
            setActiveSlotAction(null);
          }}
        >
          <label className={styles.reasonLabel} htmlFor="alternate-slot-input">
            {locale === "bn" ? "বিকল্প স্লট নির্বাচন করুন" : "Alternate slot ID"}
          </label>
          <input
            id="alternate-slot-input"
            type="text"
            required
            value={alternateSlotId}
            onChange={(e) => setAlternateSlotId(e.target.value)}
            className={styles.reasonInput}
          />
          <div className={styles.reasonActions}>
            <button type="submit" className={`${styles.button} ${styles.primary}`}>
              {locale === "bn" ? "প্রস্তাব পাঠান" : "Confirm alternate slot"}
            </button>
          </div>
        </form>
      )}

      {activeReasonAction && (
        <form className={styles.reasonSheet} onSubmit={handleConfirmReason}>
          <label className={styles.reasonLabel} htmlFor="action-reason-input">
            {locale === "bn" ? "কারণ লিখুন (বাধ্যতামূলক)" : "Reason (required)"}
          </label>
          <input
            id="action-reason-input"
            type="text"
            required
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            className={styles.reasonInput}
          />
          <div className={styles.reasonActions}>
            <button
              type="button"
              className={`${styles.button} ${styles.secondary}`}
              onClick={() => setActiveReasonAction(null)}
            >
              {locale === "bn" ? "ফিরে যান" : "Back"}
            </button>
            <button
              type="submit"
              disabled={!reasonText.trim() || isPending}
              className={`${styles.button} ${styles.destructive}`}
            >
              {locale === "bn"
                ? `নিশ্চিত করুন`
                : `Confirm ${activeReasonAction.replace(/_/g, " ")}`}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
