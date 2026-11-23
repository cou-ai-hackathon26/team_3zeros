"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { usePageLocale } from "../../../usePageLocale";
import { ApiError, createIntentIdempotencyKey } from "../../../../api/client";
import { t, formatDhakaDateTime } from "../../../../i18n/format";
import { useConsentAction, useConsents } from "../../../../api/queries/hooks";
import type { ConsentRecord } from "../../../../api/queries/types";
import { fill, humanizeCode } from "../../../../features/patient/display";
import { StatusBadge } from "../../../../components/StatusBadge/StatusBadge";
import { Column, QueryBoundary } from "../../../../components/QueryBoundary";
import { useToast } from "../../../../components/Toast/Toast";
import { Button } from "../../../../components/ui/button";
import { Alert, EmptyState } from "../../../../components/ui/states";
import { ListRow, PageHeader } from "../../../../components/ui/surfaces";

const ConfirmDialog = dynamic(() => import("../../../../components/ConfirmDialog").then((m) => m.ConfirmDialog), { ssr: false });

/** `/consents`: waiting for your answer, sharing now, past (APPLICATION_DESIGN §4.3). */
export default function ConsentsPage() {
  const locale = usePageLocale(undefined, "bn");
  const query = useConsents();
  const action = useConsentAction();
  const toast = useToast();
  const [revoking, setRevoking] = useState<ConsentRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const L = (k: string) => t(locale, `consents.${k}`);

  async function revoke(c: ConsentRecord) {
    setError(null);
    try {
      await action.mutateAsync({ kind: "revoke", id: c.id, idempotencyKey: createIntentIdempotencyKey() });
      toast({ message: L("revoked") });
    } catch (e) {
      setError(t(locale, e instanceof ApiError ? e.i18nKey : "error.generic"));
    }
  }

  return (
    <Column>
      <PageHeader serif title={L("title")} />
      {error && <Alert tone="attention" title={error} />}
      <QueryBoundary query={query} locale={locale} loadingLabel={L("loading")} errorMessage={L("error")}>
        {(data) => {
          const waiting = data.pending_requests.filter((r) => r.state === "PENDING");
          const active = data.consents.filter((c) => c.state === "ACTIVE");
          const past = data.consents.filter((c) => c.state !== "ACTIVE");
          if (!waiting.length && !active.length && !past.length) return <EmptyState message={L("empty")} />;
          return (
            <>
              {waiting.length > 0 && (
                <section aria-label={L("waiting")} className="flex flex-col gap-2">
                  <h2 className="m-0 text-heading font-semibold">{L("waiting")}</h2>
                  <ul className="m-0 p-0">
                    {waiting.map((r) => (
                      <ListRow
                        key={r.id}
                        href={`/${locale}/consents/${r.id}`}
                        title={r.recipient_practitioner_name || r.recipient_facility_name}
                        meta={humanizeCode(r.purpose)}
                        trailing={<StatusBadge entity="consent_request" state={r.state} tone="attention" locale={locale} />}
                      />
                    ))}
                  </ul>
                </section>
              )}
              {active.length > 0 && (
                <section aria-label={L("active")} className="flex flex-col gap-2">
                  <h2 className="m-0 text-heading font-semibold">{L("active")}</h2>
                  <ul className="m-0 p-0">
                    {active.map((c) => (
                      <ListRow
                        key={c.id}
                        title={c.recipient_facility_name}
                        meta={`${humanizeCode(c.purpose)}, ${c.categories.map(humanizeCode).join(", ")}`}
                        trailing={<Button size="sm" variant="secondary" onClick={() => setRevoking(c)}>{L("revoke")}</Button>}
                      />
                    ))}
                  </ul>
                </section>
              )}
              {past.length > 0 && (
                <section aria-label={L("past")} className="flex flex-col gap-2">
                  <h2 className="m-0 text-heading font-semibold">{L("past")}</h2>
                  <ul className="m-0 p-0">
                    {past.map((c) => (
                      <ListRow
                        key={c.id}
                        title={c.recipient_facility_name}
                        meta={c.revoked_at ? formatDhakaDateTime(c.revoked_at, locale) : formatDhakaDateTime(c.created_at, locale)}
                        trailing={<StatusBadge entity="consent" state={c.state} tone="neutral" locale={locale} />}
                      />
                    ))}
                  </ul>
                </section>
              )}
            </>
          );
        }}
      </QueryBoundary>
      {revoking && (
        <ConfirmDialog
          title={fill(L("revokeTitle"), { facility: revoking.recipient_facility_name })}
          description={fill(L("revokeBody"), { facility: revoking.recipient_facility_name })}
          cancelLabel={L("keep")}
          confirmLabel={L("revoke")}
          onCancel={() => setRevoking(null)}
          onConfirm={() => { const c = revoking; setRevoking(null); revoke(c); }}
        />
      )}
    </Column>
  );
}
