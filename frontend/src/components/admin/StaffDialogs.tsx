"use client";

import React, { useState } from "react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { fill } from "../../features/patient/display";
import type { AdminFacility, AdminStaffMember, NewStaff, OneTimeSecrets, PermissionEntry } from "../../api/queries/hooks";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/field";
import { Checkbox } from "../ui/selection";
import { Dialog, DialogContent } from "../ui/overlays";

const permKey = (code: string) => `admin.staff.perm.${code.replace(".", "_")}`;
const ROLES = ["clinician", "facility_staff", "facility_admin"] as const;

function PermissionBoxes({ catalogue, value, onChange, locale }: { catalogue: PermissionEntry[]; value: string[]; onChange: (v: string[]) => void; locale: Locale }) {
  return (
    <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
      <legend className="mb-1 p-0 text-dense font-semibold">{t(locale, "admin.staff.permissionsLabel")}</legend>
      {catalogue.map((p) => (
        <Checkbox
          key={p.code}
          label={t(locale, permKey(p.code))}
          checked={value.includes(p.code)}
          onCheckedChange={(on) => onChange(on ? [...value, p.code] : value.filter((c) => c !== p.code))}
        />
      ))}
    </fieldset>
  );
}

/** Create a staff account (D-16). A facility admin sees only the roles they may grant. */
export function CreateStaffDialog({ locale, catalogue, facilities, canGrantAdmin, busy, error, onSubmit, onClose }: {
  locale: Locale; catalogue: PermissionEntry[]; facilities: AdminFacility[]; canGrantAdmin: boolean; busy: boolean; error: string | null;
  onSubmit: (v: NewStaff) => void; onClose: () => void;
}) {
  const L = (k: string) => t(locale, `admin.staff.${k}`);
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState<NewStaff["role"]>("facility_staff");
  const [facility, setFacility] = useState(facilities[0]?.id ?? "");
  const [registration, setRegistration] = useState("");
  const [perms, setPerms] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const req = t(locale, "common.fieldRequired");
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = req;
    if (!identifier.trim()) next.identifier = req;
    if (!facility) next.facility = req;
    if (role === "clinician" && !registration.trim()) next.registration = req;
    setErrors(next);
    if (Object.keys(next).length) return;
    const id = identifier.trim();
    onSubmit({
      display_name: name.trim(), ...(id.includes("@") ? { email: id } : { username: id }), role, facility_id: facility, permissions: perms,
      ...(role === "clinician" ? { registration_number: registration.trim() } : {}),
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={L("createTitle")} closeLabel={t(locale, "common.close")}>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {error && <p role="alert" className="m-0 text-dense text-ink">{error}</p>}
          <Field label={L("displayName")} required error={errors.name} locale={locale}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label={L("identifier")} required error={errors.identifier} locale={locale}>{(p) => <Input {...p} value={identifier} onChange={(e) => setIdentifier(e.target.value)} />}</Field>
          <Field label={L("roleLabel")} locale={locale}>
            {(p) => (
              <select {...p} className="h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-body" value={role} onChange={(e) => setRole(e.target.value as NewStaff["role"])}>
                {ROLES.filter((r) => r !== "facility_admin" || canGrantAdmin).map((r) => <option key={r} value={r}>{t(locale, `role.${r}`)}</option>)}
              </select>
            )}
          </Field>
          {facilities.length > 1 && (
            <Field label={L("facility")} required error={errors.facility} locale={locale}>
              {(p) => <select {...p} className="h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-body" value={facility} onChange={(e) => setFacility(e.target.value)}>{facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
            </Field>
          )}
          {role === "clinician" && (
            <Field label={L("registration")} required help={L("registrationHelp")} error={errors.registration} locale={locale}>{(p) => <Input {...p} value={registration} onChange={(e) => setRegistration(e.target.value)} />}</Field>
          )}
          <PermissionBoxes catalogue={catalogue} value={perms} onChange={setPerms} locale={locale} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>{L("cancel")}</Button>
            <Button type="submit" loading={busy}>{L("create")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditStaffDialog({ locale, member, catalogue, canGrantAdmin, busy, error, onSubmit, onClose }: {
  locale: Locale; member: AdminStaffMember; catalogue: PermissionEntry[]; canGrantAdmin: boolean; busy: boolean; error: string | null;
  onSubmit: (v: { role: string; permissions: string[] }) => void; onClose: () => void;
}) {
  const L = (k: string) => t(locale, `admin.staff.${k}`);
  const [role, setRole] = useState(member.role);
  const [perms, setPerms] = useState<string[]>(member.permissions ?? []);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={fill(L("editTitle"), { name: member.name })} closeLabel={t(locale, "common.close")}>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({ role, permissions: perms }); }} className="flex flex-col gap-4">
          {error && <p role="alert" className="m-0 text-dense text-ink">{error}</p>}
          <Field label={L("roleLabel")} locale={locale}>
            {(p) => (
              <select {...p} className="h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-body" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.filter((r) => r === member.role || r !== "facility_admin" || canGrantAdmin).map((r) => <option key={r} value={r}>{t(locale, `role.${r}`)}</option>)}
              </select>
            )}
          </Field>
          <PermissionBoxes catalogue={catalogue} value={perms} onChange={setPerms} locale={locale} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>{L("cancel")}</Button>
            <Button type="submit" loading={busy}>{L("save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Shows the one-time secrets from create, reset-password and reset-mfa. Closing it discards them for good. */
export function SecretsDialog({ locale, secrets, onClose }: { locale: Locale; secrets: OneTimeSecrets; onClose: () => void }) {
  const L = (k: string) => t(locale, `admin.staff.${k}`);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={L("secretsTitle")} description={L("secretsBody")} closeLabel={t(locale, "common.close")}>
        <div className="flex flex-col gap-3">
          {secrets.temporary_password && (
            <div><p className="m-0 text-caption text-ink-muted">{L("tempPassword")}</p><code className="block break-all rounded-control bg-sunken p-2 text-body">{secrets.temporary_password}</code></div>
          )}
          {secrets.totp_uri && (
            <div><p className="m-0 text-caption text-ink-muted">{L("totpUri")}</p><code className="block break-all rounded-control bg-sunken p-2 text-caption">{secrets.totp_uri}</code></div>
          )}
          <Button onClick={onClose} className="w-fit">{L("done")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
