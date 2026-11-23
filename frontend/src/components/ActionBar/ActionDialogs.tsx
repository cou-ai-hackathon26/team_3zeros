"use client";

import React from "react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/field";
import { Dialog, DialogContent } from "../ui/overlays";

export interface ActionDialogsProps {
  locale: Locale;
  isPending: boolean;
  slotAction: string | null;
  reasonAction: string | null;
  outcomeAction: string | null;
  outcomeText: string;
  setOutcomeText: (v: string) => void;
  onCloseOutcome: () => void;
  onSubmitOutcome: (e: React.FormEvent) => void;
  alternateSlotId: string;
  reasonText: string;
  setAlternateSlotId: (v: string) => void;
  setReasonText: (v: string) => void;
  labelOf: (action: string) => string;
  closeLabel: string;
  onCloseSlot: () => void;
  onCloseReason: () => void;
  onSubmitSlot: (e: React.FormEvent) => void;
  onSubmitReason: (e: React.FormEvent) => void;
}

/** Reason and alternate-slot capture for ActionBar (MASTERPLAN §5: reason required, alternate_slot_id required). */
export function ActionDialogs(p: ActionDialogsProps) {
  const { locale } = p;
  return (
    <>
      <Dialog open={p.slotAction !== null} onOpenChange={(open) => !open && p.onCloseSlot()}>
        {p.slotAction && (
          <DialogContent title={p.labelOf(p.slotAction)} closeLabel={p.closeLabel}>
            <form className="flex flex-col gap-4" onSubmit={p.onSubmitSlot}>
              <Field label={locale === "bn" ? "বিকল্প স্লট নির্বাচন করুন" : "Alternate slot ID"} required locale={locale}>
                {(f) => <Input {...f} type="text" required value={p.alternateSlotId} onChange={(e) => p.setAlternateSlotId(e.target.value)} />}
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="submit">{locale === "bn" ? "প্রস্তাব পাঠান" : "Confirm alternate slot"}</Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={p.outcomeAction !== null} onOpenChange={(open) => !open && p.onCloseOutcome()}>
        {p.outcomeAction && (
          <DialogContent title={p.labelOf(p.outcomeAction)} closeLabel={p.closeLabel}>
            <form className="flex flex-col gap-4" onSubmit={p.onSubmitOutcome}>
              <Field label={locale === "bn" ? "ফলাফল" : "Outcome"} required locale={locale}>
                {(f) => <Input {...f} type="text" required value={p.outcomeText} onChange={(e) => p.setOutcomeText(e.target.value)} />}
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={p.onCloseOutcome}>{t(locale, "common.back")}</Button>
                <Button type="submit" disabled={!p.outcomeText.trim() || p.isPending}>{p.labelOf(p.outcomeAction)}</Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={p.reasonAction !== null} onOpenChange={(open) => !open && p.onCloseReason()}>
        {p.reasonAction && (
          <DialogContent title={p.labelOf(p.reasonAction)} closeLabel={p.closeLabel}>
            <form className="flex flex-col gap-4" onSubmit={p.onSubmitReason}>
              <Field label={locale === "bn" ? "কারণ লিখুন" : "Reason"} required locale={locale}>
                {(f) => <Input {...f} type="text" required value={p.reasonText} onChange={(e) => p.setReasonText(e.target.value)} />}
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={p.onCloseReason}>
                  {t(locale, "common.back")}
                </Button>
                <Button type="submit" variant="danger" disabled={!p.reasonText.trim() || p.isPending}>
                  {locale === "bn" ? "নিশ্চিত করুন" : `Confirm ${p.reasonAction.replace(/_/g, " ")}`}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
