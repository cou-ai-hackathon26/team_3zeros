"use client";

import React, { useState } from "react";
import { usePageLocale } from "../../app/usePageLocale";
import { t } from "../../i18n/format";
import { useAdapters } from "../../features/adapters";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/field";
import { FormAlert, genericError } from "./FormParts";
import { useDirectoryFacilities } from "./useFacilities";

/** Q-16 · access *request* on `/access`. Grants nothing and creates no account. */
export function AccessRequestForm() {
  const locale = usePageLocale(undefined, "en");
  const { accessRequest } = useAdapters();
  const [f, setF] = useState({ name: "", bmdc: "", contact: "" });
  const [facilityId, setFacilityId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ facility: string; reference?: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const facilities = useDirectoryFacilities();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const required = t(locale, "auth.error.required");
    const next: Record<string, string> = {};
    if (!f.name.trim()) next.name = required;
    if (!f.bmdc.trim()) next.bmdc = required;
    if (!facilityId) next.facility = required;
    if (!f.contact.trim()) next.contact = required;
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setFormError(null);
    try {
      const out = await accessRequest.submit({ name: f.name.trim(), bmdc_registration_number: f.bmdc.trim(), facility_id: facilityId, contact: f.contact.trim() });
      const fac = (facilities.data ?? []).find((x) => x.id === facilityId);
      setDone({ facility: fac ? (locale === "bn" && fac.name_bn ? fac.name_bn : fac.name) : "", reference: out.reference });
    } catch (err) {
      setFormError(genericError(locale, err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="flex flex-col gap-2">
        <p className="m-0 text-body">{t(locale, "auth.access.sent").replace("{facility}", done.facility)}</p>
        {done.reference && <p className="m-0 text-dense text-ink-muted">{t(locale, "auth.access.reference")}: <span className="tabular-nums">{done.reference}</span></p>}
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <h2 className="m-0 text-heading font-semibold">{t(locale, "auth.access.requestTitle")}</h2>
      <p className="m-0 text-dense text-ink-muted">{t(locale, "auth.access.requestHelp")}</p>
      <FormAlert message={formError} />
      <Field label={t(locale, "auth.access.name")} required error={errors.name} locale={locale}>{(p) => <Input {...p} autoComplete="name" value={f.name} onChange={set("name")} />}</Field>
      <Field label={t(locale, "auth.access.bmdc")} required error={errors.bmdc} locale={locale}>{(p) => <Input {...p} value={f.bmdc} onChange={set("bmdc")} />}</Field>
      <Field label={t(locale, "auth.access.facility")} required error={errors.facility} locale={locale}>
        {(p) => (
          <select {...p} className="h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-body" value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
            <option value="">{t(locale, "place.choose")}</option>
            {(facilities.data ?? []).map((x) => <option key={x.id} value={x.id}>{locale === "bn" && x.name_bn ? x.name_bn : x.name}</option>)}
          </select>
        )}
      </Field>
      <Field label={t(locale, "auth.access.contact")} required error={errors.contact} locale={locale}>{(p) => <Input {...p} value={f.contact} onChange={set("contact")} />}</Field>
      <Button type="submit" size="lg" loading={busy} loadingLabel={t(locale, "auth.access.sending")}>{t(locale, "auth.access.send")}</Button>
    </form>
  );
}

