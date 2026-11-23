"use client";

import React, { useState } from "react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { getActionDefinition, type StatefulEntity } from "../../state/actions";
import { createIntentIdempotencyKey } from "../../api/client";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";
import dynamic from "next/dynamic";

// The reason and alternate-slot dialogs are rare; loading them on demand keeps the Radix dialog out of
// the first load of every page that has an ActionBar (170 KB patient budget, FRONTEND §11).
const ActionDialogs = dynamic(() => import("./ActionDialogs").then((m) => m.ActionDialogs), { ssr: false });

export interface ActionPayload {
  reason?: string;
  alternateSlotId?: string;
  /** Free-text outcome for `record_outcome`. The server accepts a JSON object; its shape is not yet in the contract (MASTERPLAN §8.3 G-8). */
  outcome?: { summary: string };
  idempotencyKey: string;
}

export interface ActionBarProps {
  entity: StatefulEntity;
  allowedActions: string[];
  isPending: boolean;
  /** Actions to show but disable (for example while a draft has unsaved edits). They still come from `allowed_actions`. */
  disabledActions?: string[];
  locale: Locale;
  className?: string;
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
  disabledActions = [],
  locale,
  className,
  onAction,
}: ActionBarProps) {
  const [activeReasonAction, setActiveReasonAction] = useState<string | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [activeSlotAction, setActiveSlotAction] = useState<string | null>(null);
  const [alternateSlotId, setAlternateSlotId] = useState("");
  const [activeOutcomeAction, setActiveOutcomeAction] = useState<string | null>(null);
  const [outcomeText, setOutcomeText] = useState("");
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

  function handleActionClick(action: string, requiresReason: boolean, requiresAlternateSlot?: boolean, requiresOutcome?: boolean) {
    const key = getOrMintIntentKey(action);
    if (requiresReason) {
      setActiveReasonAction(action);
      setReasonText("");
      return;
    }
    if (requiresOutcome) {
      setActiveOutcomeAction(action);
      setOutcomeText("");
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

  const labelOf = (action: string) => t(locale, getActionDefinition(entity, action).labelKey);
  const reasonOpen = activeReasonAction !== null;
  const slotOpen = activeSlotAction !== null;
  const closeLabel = t(locale, "common.close");

  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-2", className)}>
      {definitions.map((def) => (
        <Button
          key={def.action}
          disabled={isPending || disabledActions.includes(def.action)}
          variant={def.confirmationStyle === "primary" ? "primary" : "secondary"}
          onClick={() => handleActionClick(def.action, def.requiresReason, def.requiresAlternateSlot, def.requiresOutcome)}
        >
          {t(locale, def.labelKey)}
        </Button>
      ))}

      {(slotOpen || reasonOpen || activeOutcomeAction !== null) && (
        <ActionDialogs
          locale={locale}
          isPending={isPending}
          slotAction={activeSlotAction}
          reasonAction={activeReasonAction}
          outcomeAction={activeOutcomeAction}
          outcomeText={outcomeText}
          setOutcomeText={setOutcomeText}
          onCloseOutcome={() => setActiveOutcomeAction(null)}
          onSubmitOutcome={(e) => {
            e.preventDefault();
            if (!activeOutcomeAction || !outcomeText.trim()) return;
            onAction(activeOutcomeAction, { outcome: { summary: outcomeText.trim() }, idempotencyKey: getOrMintIntentKey(activeOutcomeAction) });
            setActiveOutcomeAction(null);
          }}
          alternateSlotId={alternateSlotId}
          reasonText={reasonText}
          setAlternateSlotId={setAlternateSlotId}
          setReasonText={setReasonText}
          labelOf={labelOf}
          closeLabel={closeLabel}
          onCloseSlot={() => setActiveSlotAction(null)}
          onCloseReason={() => setActiveReasonAction(null)}
          onSubmitSlot={(e) => {
            e.preventDefault();
            if (!activeSlotAction || !alternateSlotId.trim()) return;
            onAction(activeSlotAction, {
              alternateSlotId: alternateSlotId.trim(),
              idempotencyKey: getOrMintIntentKey(activeSlotAction),
            });
            setActiveSlotAction(null);
          }}
          onSubmitReason={handleConfirmReason}
        />
      )}
    </div>
  );
}
