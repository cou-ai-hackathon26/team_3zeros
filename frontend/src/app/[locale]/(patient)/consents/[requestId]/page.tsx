"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePageLocale } from "../../../../usePageLocale";
import { createIntentIdempotencyKey } from "../../../../../api/client";
import { t } from "../../../../../i18n/format";
import { useConsentAction, useConsentRequest } from "../../../../../api/queries/hooks";
import { ConsentSheet } from "../../../../../components/ConsentSheet/ConsentSheet";
import { Column, QueryBoundary } from "../../../../../components/QueryBoundary";
import { StatusBadge } from "../../../../../components/StatusBadge/StatusBadge";
import { useToast } from "../../../../../components/Toast/Toast";
import { humanizeCode } from "../../../../../features/patient/display";
import { Alert } from "../../../../../components/ui/states";

/**
 * `/consents/[requestId]`: decide. Two buttons of equal size and weight (INV-10). The request,
 * its purpose and its categories come from the backend, not from message files.
 * The sender's approval is a separate step (INV-10): agreeing here sends nothing by itself.
 */
export default function ConsentRequestPage() {
  const locale = usePageLocale(undefined, "bn");
  const requestId = String(useParams<{ requestId: string }>()?.requestId ?? "");
  const query = useConsentRequest(requestId);
  const action = useConsentAction();
  const toast = useToast();
  const [outcome, setOutcome] = useState<"granted" | "refused" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const L = (k: string) => t(locale, `consents.${k}`);

  async function decide(kind: "grant" | "refuse") {
    if (action.isPending) return; // one decision per press
    setError(null);
    try {
      await action.mutateAsync({ kind, id: requestId, idempotencyKey: createIntentIdempotencyKey() });
      setOutcome(kind === "grant" ? "granted" : "refused");
      toast({ message: kind === "grant" ? L("granted") : L("refused") });
    } catch (e) {
      // Whatever the cause, say plainly that nothing was shared, and keep both buttons available.
      void e;
      setError(L("error"));
      await query.refetch();
    }
  }

  return (
    <Column>
      <Link href={`/${locale}/consents`} className="text-dense text-indigo underline underline-offset-2">{L("back")}</Link>
      <QueryBoundary query={query} locale={locale} loadingLabel={L("loading")} errorMessage={L("error")} notFoundMessage={L("notFound")}>
        {(r) => {
          const decided = outcome ?? (r.state === "GRANTED" ? "granted" : r.state === "REFUSED" ? "refused" : null);
          return (
            <>
              {error && <Alert tone="attention" title={error} />}
              {decided ? (
                <section aria-live="polite" className="flex flex-col gap-3 rounded-tile border border-line bg-surface p-5">
                  <h1 className="m-0 font-serif text-title">{L("requestTitle")}</h1>
                  <StatusBadge entity="consent_request" state={decided === "granted" ? "GRANTED" : "REFUSED"} tone={decided === "granted" ? "positive" : "neutral"} locale={locale} />
                  <p className="m-0 text-body">{decided === "granted" ? L("decidedGranted") : L("decidedRefused")}</p>
                </section>
              ) : r.state !== "PENDING" ? (
                <section className="flex flex-col gap-3 rounded-tile border border-line bg-surface p-5">
                  <h1 className="m-0 font-serif text-title">{L("requestTitle")}</h1>
                  <StatusBadge entity="consent_request" state={r.state} tone="neutral" locale={locale} />
                  <p className="m-0 text-body">{L("alreadyDecided")}</p>
                </section>
              ) : (
                <ConsentSheet
                  recipientPractitioner={r.recipient_practitioner_name}
                  recipientFacility={r.recipient_facility_name}
                  purpose={humanizeCode(r.purpose)}
                  categories={r.categories.map(humanizeCode)}
                  expiresAt={r.expires_at}
                  locale={locale}
                  onGrant={() => decide("grant")}
                  onRefuse={() => decide("refuse")}
                />
              )}
            </>
          );
        }}
      </QueryBoundary>
    </Column>
  );
}
