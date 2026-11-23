"use client";

import React, { useEffect, useState } from "react";
import { usePageLocale } from "../../../usePageLocale";
import { t } from "../../../../i18n/format";
import { usePatientSearch } from "../../../../api/queries/hooks";
import { Field, Input } from "../../../../components/ui/field";
import { EmptyState, ErrorState, Skeleton } from "../../../../components/ui/states";
import { ListRow, PageHeader } from "../../../../components/ui/surfaces";
import { patientDisplayName } from "../../../../components/clinical/QueueDetail";

/** `/patients`: find a patient within scope. Results come only from the API; no recent-patients list is invented. */
export default function PatientsPage() {
  const locale = usePageLocale(undefined, "en");
  const L = (k: string) => t(locale, `patients.${k}`);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  const search = usePatientSearch(debounced);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title={L("title")} />
      <Field label={L("searchLabel")} locale={locale}>{(p) => <Input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} />}</Field>
      {!debounced ? (
        <p className="m-0 text-dense text-ink-muted">{L("searchHelp")}</p>
      ) : search.isLoading ? (
        <Skeleton />
      ) : search.isError ? (
        <ErrorState message={L("searchError")} locale={locale} onRetry={() => search.refetch()} />
      ) : (search.data ?? []).length === 0 ? (
        <EmptyState message={L("none")} />
      ) : (
        <ul className="m-0 p-0">
          {(search.data ?? []).map((p) => (
            <ListRow key={p.id} href={`/${locale}/patients/${p.id}`} title={`${patientDisplayName(p, "")}${p.name_bn ? ` (${p.name_bn})` : ""}`} meta={[p.phone, p.sex, p.birth_date].filter(Boolean).join(", ")} />
          ))}
        </ul>
      )}
    </div>
  );
}
