"use client";

import React, { useState } from "react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { getActionDefinition, type StatefulEntity } from "../../state/actions";
import { createIntentIdempotencyKey } from "../../api/client";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/field";
import { Dialog, DialogContent } from "../ui/overlays";

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
  locale,
  className,
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

  const labelOf = (action: string) => t(locale, getActionDefinition(entity, action).labelKey);
  const reasonOpen = activeReasonAction !== null;
  const slotOpen = activeSlotAction !== null;
  const closeLabel = t(locale, "common.close");

  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-2", className)}>
      {definitions.map((def) => (
        <Button
          key={def.action}
          disabled={isPending}
          variant={def.confirmationStyle === "primary" ? "primary" : "secondary"}
          onClick={() => handleActionClick(def.action, def.requiresReason, def.requiresAlternateSlot)}
        >
          {t(locale, def.labelKey)}
        </Button>
      ))}

      <Dialog open={slotOpen} onOpenChange={(open) => !open && setActiveSlotAction(null)}>
        {activeSlotAction && (
          <DialogContent title={labelOf(activeSlotAction)} closeLabel={closeLabel}>
            <form
              className="flex flex-col gap-4"
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
              <Field label={locale === "bn" ? "বিকল্প স্লট নির্বাচন করুন" : "Alternate slot ID"} required locale={locale}>
                {(p) => <Input {...p} type="text" required value={alternateSlotId} onChange={(e) => setAlternateSlotId(e.target.value)} />}
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="submit">{locale === "bn" ? "প্রস্তাব পাঠান" : "Confirm alternate slot"}</Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={reasonOpen} onOpenChange={(open) => !open && setActiveReasonAction(null)}>
        {activeReasonAction && (
          <DialogContent title={labelOf(activeReasonAction)} closeLabel={closeLabel}>
            <form className="flex flex-col gap-4" onSubmit={handleConfirmReason}>
              <Field label={locale === "bn" ? "কারণ লিখুন" : "Reason"} required locale={locale}>
                {(p) => <Input {...p} type="text" required value={reasonText} onChange={(e) => setReasonText(e.target.value)} />}
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setActiveReasonAction(null)}>
                  {t(locale, "common.back")}
                </Button>
                <Button type="submit" variant="danger" disabled={!reasonText.trim() || isPending}>
                  {locale === "bn" ? "নিশ্চিত করুন" : `Confirm ${activeReasonAction.replace(/_/g, " ")}`}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
