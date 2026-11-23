"use client";

import React, { useState } from "react";
import { usePageLocale } from "../../../usePageLocale";
import { ApiError, createIntentIdempotencyKey } from "../../../../api/client";
import {
  asList,
  useAdminFacilities,
  useAdminStaff,
  useAdminAccessRequests,
  useAccessRequestActions,
  usePermissionCatalogue,
  useStaffAccess,
  type AdminStaffMember,
  type AccessRequestItem,
  type OneTimeSecrets,
} from "../../../../api/queries/hooks";
import { cn } from "../../../../lib/cn";
import { hasRole } from "../../../../auth/access";
import { useMe } from "../../../../auth/me";
import { t, formatDhakaDateTime } from "../../../../i18n/format";
import { fill } from "../../../../features/patient/display";
import {
  CreateStaffDialog,
  EditStaffDialog,
  SecretsDialog,
  DeclineRequestDialog,
} from "../../../../components/admin/StaffDialogs";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { Check, CircleOff, Clock, XCircle } from "lucide-react";
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

/** `/staff`: who has access, and control of it (MASTERPLAN D-16, D-19). Facility admins see their own facility; platform admins see all. */
export default function AdminStaffPage() {
  const locale = usePageLocale(undefined, "en");
  const L = (k: string) => t(locale, `admin.staff.${k}`);
  const { me } = useMe();
  const platform = hasRole(me, "platform_admin");
  const [tab, setTab] = useState<"staff" | "requests">("staff");
  const staff = useAdminStaff();
  const accessRequests = useAdminAccessRequests();
  const facilities = useAdminFacilities();
  const catalogue = usePermissionCatalogue();
  const { create, update, action } = useStaffAccess();
  const { approve, reject } = useAccessRequestActions();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminStaffMember | null>(null);
  const [confirm, setConfirm] = useState<{ member: AdminStaffMember; kind: Kind } | null>(null);
  const [declineTarget, setDeclineTarget] = useState<AccessRequestItem | null>(null);
  const [secrets, setSecrets] = useState<OneTimeSecrets | null>(null);
  const [error, setError] = useState<string | null>(null);

  const staffRows = asList(staff.data);
  const requestRows = asList(accessRequests.data);
  const pendingCount = requestRows.filter((r) => r.status === "PENDING").length;

  const fail = (e: unknown) => setError(e instanceof ApiError && e.status === 403 ? e.message : L("changeError"));

  async function runAction(member: AdminStaffMember, kind: Kind) {
    setError(null);
    try {
      const out = await action.mutateAsync({ id: member.id, kind, idempotencyKey: createIntentIdempotencyKey() });
      if (out.temporary_password || out.totp_uri) setSecrets({ temporary_password: out.temporary_password, totp_uri: out.totp_uri });
      else toast({ message: L("saved") });
    } catch (e) { fail(e); }
  }

  async function handleApprove(req: AccessRequestItem) {
    setError(null);
    try {
      const res = await approve.mutateAsync(req.id);
      if (res.details?.temporary_password || res.details?.totp_uri) {
        setSecrets({ temporary_password: res.details.temporary_password, totp_uri: res.details.totp_uri });
      }
      toast({ message: L("requestApproved") });
    } catch (e) { fail(e); }
  }

  async function handleDecline(reason: string) {
    if (!declineTarget) return;
    setError(null);
    try {
      await reject.mutateAsync({ id: declineTarget.id, reason });
      setDeclineTarget(null);
      toast({ message: L("requestDeclined") });
    } catch (e) { fail(e); }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t(locale, "admin.staff.title")}
        context={t(locale, "admin.staff.context")}
        actions={tab === "staff" ? <Button onClick={() => { setError(null); setCreating(true); }}>{L("add")}</Button> : null}
      />

      <div className="flex border-b border-line gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "staff"}
          className={cn("px-4 py-2 text-dense font-medium border-b-2 transition-colors", tab === "staff" ? "border-indigo text-indigo" : "border-transparent text-ink-muted hover:text-ink")}
          onClick={() => setTab("staff")}
        >
          {L("tabStaff")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "requests"}
          className={cn("px-4 py-2 text-dense font-medium border-b-2 transition-colors inline-flex items-center gap-1.5", tab === "requests" ? "border-indigo text-indigo" : "border-transparent text-ink-muted hover:text-ink")}
          onClick={() => setTab("requests")}
        >
          <span>{L("tabRequests")}</span>
          {pendingCount > 0 && (
            <span className="rounded-full bg-attention-wash px-1.5 py-0.5 text-caption font-semibold text-attention">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {error && <Alert tone="attention" title={error} />}

      {tab === "staff" ? (
        staff.isLoading ? <Skeleton label={t(locale, "admin.staff.loading")} /> : staff.isError ? (
          <ErrorState message={t(locale, "admin.staff.error")} locale={locale} onRetry={() => staff.refetch()} />
        ) : staffRows.length === 0 ? (
          <EmptyState message={t(locale, "admin.staff.empty")} />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t(locale, "admin.staff.name")}</TableHeaderCell>
                <TableHeaderCell>{L("facility")}</TableHeaderCell>
                <TableHeaderCell>{t(locale, "admin.staff.role")}</TableHeaderCell>
                <TableHeaderCell>{t(locale, "admin.staff.contact")}</TableHeaderCell>
                <TableHeaderCell>{t(locale, "admin.staff.permissions")}</TableHeaderCell>
                <TableHeaderCell>{L("status")}</TableHeaderCell>
                <TableHeaderCell>{L("actions")}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <tbody>
              {staffRows.map((m) => {
                const own = !!me && m.user_id === me.id;
                const isActive = m.active !== false;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-semibold">{m.name}</TableCell>
                    <TableCell>{m.facility_name}</TableCell>
                    <TableCell>{t(locale, `role.${m.role}`)}</TableCell>
                    <TableCell className="text-dense text-ink-muted">{m.email || m.username || "—"}</TableCell>
                    <TableCell className="text-caption text-ink-muted">{(m.permissions ?? []).map((p) => t(locale, `admin.staff.perm.${p.replace(".", "_")}`)).join(", ") || "—"}</TableCell>
                    <TableCell>
                      {/* Icon and word, never colour alone. */}
                      <span className={`inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-dense font-medium ${isActive ? "bg-positive-wash text-positive" : "bg-sunken text-ink"}`}>
                        {isActive ? <Check aria-hidden className="size-4" /> : <CircleOff aria-hidden className="size-4" />}
                        {isActive ? L("active") : L("inactive")}
                      </span>
                    </TableCell>
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
        )
      ) : (
        accessRequests.isLoading ? <Skeleton label={L("requestsLoading")} /> : accessRequests.isError ? (
          <ErrorState message={L("requestsError")} locale={locale} onRetry={() => accessRequests.refetch()} />
        ) : requestRows.length === 0 ? (
          <EmptyState message={L("requestsEmpty")} />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{L("applicant")}</TableHeaderCell>
                <TableHeaderCell>{L("bmdc")}</TableHeaderCell>
                <TableHeaderCell>{L("target")}</TableHeaderCell>
                <TableHeaderCell>{L("requestedAt")}</TableHeaderCell>
                <TableHeaderCell>{L("status")}</TableHeaderCell>
                <TableHeaderCell>{L("actions")}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <tbody>
              {requestRows.map((r) => {
                const isPending = r.status === "PENDING";
                const isApproved = r.status === "APPROVED";
                const isRejected = r.status === "REJECTED";
                const isChamber = Boolean(r.chamber_name);
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-dense text-ink-muted">{r.contact}</div>
                    </TableCell>
                    <TableCell className="font-mono text-dense">{r.bmdc_registration_number || "—"}</TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {isChamber
                          ? (locale === "bn" && r.chamber_name_bn ? r.chamber_name_bn : r.chamber_name)
                          : (locale === "bn" && r.facility_name_bn ? r.facility_name_bn : r.facility_name)}
                      </div>
                      <div className="text-caption text-ink-muted">
                        {isChamber ? L("chamber") : L("facilityStaff")}
                      </div>
                    </TableCell>
                    <TableCell className="text-dense text-ink-muted">
                      {formatDhakaDateTime(r.created_at, locale)}
                    </TableCell>
                    <TableCell>
                      {isApproved && (
                        <span className="inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-dense font-medium bg-positive-wash text-positive">
                          <Check aria-hidden className="size-4" />
                          {L("statusApproved")}
                        </span>
                      )}
                      {isPending && (
                        <span className="inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-dense font-medium bg-attention-wash text-attention">
                          <Clock aria-hidden className="size-4" />
                          {L("statusPending")}
                        </span>
                      )}
                      {isRejected && (
                        <span className="inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-dense font-medium bg-sunken text-ink">
                          <XCircle aria-hidden className="size-4" />
                          {L("statusRejected")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isPending ? (
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="primary" loading={approve.isPending} onClick={() => handleApprove(r)}>
                            {L("approve")}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setDeclineTarget(r)}>
                            {L("reject")}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-caption text-ink-muted">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </tbody>
          </Table>
        )
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
      {declineTarget && (
        <DeclineRequestDialog
          locale={locale}
          targetName={declineTarget.name}
          busy={reject.isPending}
          error={error}
          onClose={() => setDeclineTarget(null)}
          onSubmit={handleDecline}
        />
      )}
      {secrets && (secrets.temporary_password || secrets.totp_uri) && <SecretsDialog locale={locale} secrets={secrets} onClose={() => setSecrets(null)} />}
    </div>
  );
}
