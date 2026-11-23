"use client";

import { useState } from "react";
import { ApiError } from "../../api/client";
import { useTransition } from "../../api/queries/hooks";
import type { ActionPayload } from "../../components/ActionBar/ActionBar";
import { useToast } from "../../components/Toast/Toast";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";

/**
 * Runs a case action through the server (POST …/actions/{action}) with If-Match and one idempotency
 * key per press. A 202 is "saving", never "done" (INV-12). 412 and 423 refetch and show the latest,
 * without a blind retry. The caller passes `refetch` for the object being viewed.
 */
export function useCaseActions(entity: "appointments" | "referrals", locale: Locale, refetch?: () => Promise<unknown>) {
  const transition = useTransition(entity);
  const toast = useToast();
  const [notice, setNotice] = useState<string | null>(null);
  const noun = entity === "appointments" ? "appointment" : "referral";

  async function run(object: { id: string; version: number }, action: string, payload: ActionPayload): Promise<boolean> {
    setNotice(null);
    try {
      const { pending } = await transition.mutateAsync({
        id: object.id,
        action,
        version: object.version,
        idempotencyKey: payload.idempotencyKey,
        body: {
          ...(payload.reason ? { reason: payload.reason } : {}),
          ...(payload.alternateSlotId ? { alternate_slot_id: payload.alternateSlotId } : {}),
          ...(payload.outcome ? { outcome: payload.outcome } : {}),
        },
      });
      if (!pending) toast({ message: t(locale, `toast.${noun}.${action}`) });
      return true;
    } catch (e) {
      const api = e instanceof ApiError ? e : null;
      if (api && (api.status === 412 || api.status === 423)) await refetch?.();
      setNotice(t(locale, api?.i18nKey ?? "error.generic"));
      return false;
    }
  }

  return { run, notice, clearNotice: () => setNotice(null), isPending: transition.isPending };
}
