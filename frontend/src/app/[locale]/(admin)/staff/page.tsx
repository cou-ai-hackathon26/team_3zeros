"use client";

import React, { useState } from "react";
import { usePageLocale } from "../../../usePageLocale";
import { ApiError, createIntentIdempotencyKey } from "../../../../api/client";
import { asList, useAdminFacilities, useAdminStaff, usePermissionCatalogue, useStaffAccess, type AdminStaffMember, type OneTimeSecrets } from "../../../../api/queries/hooks";
import { hasRole } from "../../../../auth/access";
import { useMe } from "../../../../auth/me";
import { t } from "../../../../i18n/format";
import { fill } from "../../../../features/patient/display";
import { CreateStaffDialog, EditStaffDialog, SecretsDialog } from "../../../../components/admin/StaffDialogs";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { StatusBadge } from "../../../../components/StatusBadge/StatusBadge";
import { useToast } from "../../../../components/Toast/Toast";
import { Button } from "../../../../components/ui/button";
import { Alert, EmptyState, ErrorState, Skeleton } from "../../../../components/ui/states";
import { PageHeader } from "../../../../components/ui/surfaces";
import { Table, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/ui/table";

type Kind = "deactivate" | "reactivate" | "reset-password" | "reset-mfa" | "revoke-sessions";
const CONFIRM: Partial<Record<Kind, [string, string]>> = {
  deactivate: ["confirmDeactivate", "confirmDeactivateBody"],
  "reset-password": ["confirmReset", "confirmResetBody"],
  "reset-mfa": ["confirmMfa", "confirmMfaBody"],
  "revoke-sessions": ["confirmRevoke", "confirmRevokeBody"],
};

/** `/staff`: who has access, and control of it (MASTERPLAN D-16). Facility admins see their own facility; platform admins see all. */
export default function AdminStaffPage() {
  const locale = usePageLocale(undefined, "en");
  const L = (k: string) => t(locale, `admin.staff.${k}`);
  const { me } = useMe();
  const platform = hasRole(me, "platform_admin");
  const staff = useAdminStaff();
  const facilities = useAdminFacilities();
  const catalogue = usePermissionCatalogue();
  const { create, update, action } = useStaffAccess();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminStaffMember | null>(null);
  const [confirm, setConfirm] = useState<{ member: AdminStaffMember; kind: Kind } | null>(null);
  const [secrets, setSecrets] = useState<OneTimeSecrets | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = asList(staff.data);
  const fail = (e: unknown) => setError(e instanceof ApiError && e.status === 403 ? e.message : L("changeError"));

  async function runAction(member: AdminStaffMember, kind: Kind) {
    setError(null);
    try {
      const out = await action.mutateAsync({ id: member.id, kind, idempotencyKey: createIntentIdempotencyKey() });
      if (out.temporary_password || out.totp_uri) setSecrets({ temporary_password: out.temporary_password, totp_uri: out.totp_uri });
      else toast({ message: L("saved") });
    } catch (e) { fail(e); }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t(locale, "admin.staff.title")} context={t(locale, "admin.staff.context")} actions={<Button onClick={() => { setError(null); setCreating(true); }}>{L("add")}</Button>} />
      {error && <Alert tone="attention" title={error} />}

      {staff.isLoading ? <Skeleton label={t(locale, "admin.staff.loading")} /> : staff.isError ? (
        <ErrorState message={t(locale, "admin.staff.error")} locale={locale} onRetry={() => staff.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState message={t(locale, "admin.staff.empty")} />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t(locale, "admin.staff.name")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "admin.staff.role")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "admin.staff.contact")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "admin.staff.permissions")}</TableHeaderCell>
              <TableHeaderCell>{L("status")}</TableHeaderCell>
              <TableHeaderCell>{L("actions")}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <tbody>
            {rows.map((m) => {
              const own = !!me && m.user_id === me.id;
              const isActive = m.active !== false;
              return (
                <TableRow key={m.id}>
                  <TableCell className="font-semibold">{m.name}</TableCell>
                  <TableCell>{t(locale, `role.${m.role}`)}</TableCell>
                  <TableCell className="text-dense text-ink-muted">{m.email || m.username || "—"}</TableCell>
                  <TableCell className="text-caption text-ink-muted">{(m.permissions ?? []).map((p) => t(locale, `admin.staff.perm.${p.replace(".", "_")}`)).join(", ") || "—"}</TableCell>
                  <TableCell><StatusBadge entity="consent" state={isActive ? "ACTIVE" : "REVOKED"} tone={isActive ? "positive" : "neutral"} locale={locale} /></TableCell>
                  <TableCell>
                    {own ? <span className="text-caption text-ink-muted">{L("selfNote")}</span> : (
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="secondary" onClick={() => { setError(null); setEditing(m); }}>{L("edit")}</Button>
                        {isActive ? (
                          <Button size="sm" variant="secondary" onClick={() => setConfirm({ member: m, kind: "deactivate" })}>{L("deactivate")}</Button>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => runAction(m, "reactivate")}>{L("reactivate")}</Button>
                        )}
                        <Button size="sm" variant="quiet" onClick={() => setConfirm({ member: m, kind: "reset-password" })}>{L("resetPassword")}</Button>
                        <Button size="sm" variant="quiet" onClick={() => setConfirm({ member: m, kind: "reset-mfa" })}>{L("resetMfa")}</Button>
                        <Button size="sm" variant="quiet" onClick={() => setConfirm({ member: m, kind: "revoke-sessions" })}>{L("revokeSessions")}</Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
      )}

      {creating && (
        <CreateStaffDialog
          locale={locale} catalogue={asList(catalogue.data)} facilities={asList(facilities.data)} canGrantAdmin={platform}
          busy={create.isPending} error={error}
          onClose={() => setCreating(false)}
          onSubmit={async (body) => {
            setError(null);
            try {
              const out = await create.mutateAsync({ body, idempotencyKey: createIntentIdempotencyKey() });
              setCreating(false);
              setSecrets({ temporary_password: out.temporary_password, totp_uri: out.totp_uri });
            } catch (e) { fail(e); }
          }}
        />
      )}
      {editing && (
        <EditStaffDialog
          locale={locale} member={editing} catalogue={asList(catalogue.data)} canGrantAdmin={platform} busy={update.isPending} error={error}
          onClose={() => setEditing(null)}
          onSubmit={async (v) => {
            setError(null);
            try { await update.mutateAsync({ id: editing.id, ...v }); setEditing(null); toast({ message: L("saved") }); } catch (e) { fail(e); }
          }}
        />
      )}
      {confirm && CONFIRM[confirm.kind] && (
        <ConfirmDialog
          title={fill(L(CONFIRM[confirm.kind]![0]), { name: confirm.member.name })}
          description={L(CONFIRM[confirm.kind]![1])}
          cancelLabel={L("cancel")}
          confirmLabel={confirm.kind === "deactivate" ? L("deactivate") : confirm.kind === "reset-password" ? L("resetPassword") : confirm.kind === "reset-mfa" ? L("resetMfa") : L("revokeSessions")}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { const c = confirm; setConfirm(null); runAction(c.member, c.kind); }}
        />
      )}
      {secrets && (secrets.temporary_password || secrets.totp_uri) && <SecretsDialog locale={locale} secrets={secrets} onClose={() => setSecrets(null)} />}
    </div>
  );
}
