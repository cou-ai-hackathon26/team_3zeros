"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { Check, CircleAlert, Loader } from "lucide-react";
import { usePageLocale } from "../../../usePageLocale";
import { ApiError } from "../../../../api/client";
import { useKnowledgeActions, useKnowledgeDocuments, useKnowledgeSearch, type KnowledgeDocument } from "../../../../api/queries/hooks";
import { hasRole } from "../../../../auth/access";
import { useMe } from "../../../../auth/me";
import { fill } from "../../../../features/patient/display";
import "../../../../i18n/knowledge";
import { formatDhakaDateTime, formatDisplayNumber, t } from "../../../../i18n/format";
import { ApproveDialog, UploadDialog } from "../../../../components/admin/KnowledgeDialogs";
import { Button } from "../../../../components/ui/button";
import { Field, Input, Select } from "../../../../components/ui/field";
import { Alert, EmptyState, ErrorState, Skeleton } from "../../../../components/ui/states";
import { PageHeader, Panel } from "../../../../components/ui/surfaces";
import { Table, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/ui/table";
import { useToast } from "../../../../components/Toast/Toast";

const ConfirmDialog = dynamic(() => import("../../../../components/ConfirmDialog").then((m) => m.ConfirmDialog));

const STATUS_ICON = { PROCESSING: Loader, READY: Check, FAILED: CircleAlert } as const;

/** `/knowledge`: reference books for triage (MASTERPLAN D-29). A status word and icon, never colour alone. */
export default function KnowledgePage() {
  const locale = usePageLocale(undefined, "en");
  const T = (k: string) => t(locale, `knowledge.${k}`);
  const { me } = useMe();
  const docs = useKnowledgeDocuments();
  const { approve, retire, retry, remove } = useKnowledgeActions();
  const search = useKnowledgeSearch();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [approving, setApproving] = useState<KnowledgeDocument | null>(null);
  const [confirm, setConfirm] = useState<{ doc: KnowledgeDocument; kind: "retire" | "delete" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("");

  if (!hasRole(me, "platform_admin")) return <EmptyState message={T("notAllowed")} />;

  const fail = (e: unknown) => setError(e instanceof ApiError && e.message ? e.message : T("changeError"));
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      toast({ message: T("saved") });
    } catch (e) {
      fail(e);
    }
  };
  const rows = docs.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={T("title")} context={T("context")} actions={<Button onClick={() => setUploading(true)}>{T("upload")}</Button>} />
      {error && <Alert tone="attention" title={error} />}

      {docs.isLoading ? <Skeleton label={T("loading")} /> : docs.isError ? (
        <ErrorState message={T("error")} locale={locale} onRetry={() => docs.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState message={T("empty")} />
      ) : (
        <Table aria-label={T("title")}>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{T("colTitle")}</TableHeaderCell>
              <TableHeaderCell className="text-end">{T("colPages")}</TableHeaderCell>
              <TableHeaderCell className="text-end">{T("colPassages")}</TableHeaderCell>
              <TableHeaderCell>{T("colStatus")}</TableHeaderCell>
              <TableHeaderCell>{T("colApproved")}</TableHeaderCell>
              <TableHeaderCell>{T("colActions")}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <tbody>
            {rows.map((d) => {
              const Icon = STATUS_ICON[d.status];
              return (
                <TableRow key={d.id}>
                  <TableCell>
                    <span className="font-semibold">{d.title}</span>
                    {d.version && <span className="ms-1 text-ink-muted">({d.version})</span>}
                  </TableCell>
                  <TableCell numeric>{formatDisplayNumber(d.page_count, locale)}</TableCell>
                  <TableCell numeric>{formatDisplayNumber(d.chunk_count, locale)}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      <Icon aria-hidden className="size-4" />
                      {T(`status${d.status}`)}
                    </span>
                    <span className="block text-caption text-ink-muted">
                      {fill(T("embedded"), { done: formatDisplayNumber(d.embedded_count, locale), total: formatDisplayNumber(d.chunk_count, locale) })}
                    </span>
                    {d.error && <span className="block text-caption text-attention">{d.error}</span>}
                  </TableCell>
                  <TableCell>
                    {d.approved
                      ? <>{fill(T("approvedBy"), { name: d.approved_by_name ?? "", reviewer: d.reviewer_name })}{d.approved_at && <span className="block text-caption text-ink-muted">{formatDhakaDateTime(d.approved_at, locale)}</span>}</>
                      : d.retired_at ? T("retired") : T("notApproved")}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      {d.status === "READY" && !d.approved && <Button size="sm" onClick={() => { setError(null); setApproving(d); }}>{T("approve")}</Button>}
                      {d.approved && <Button size="sm" variant="secondary" onClick={() => setConfirm({ doc: d, kind: "retire" })}>{T("retire")}</Button>}
                      {d.status === "FAILED" && <Button size="sm" variant="secondary" onClick={() => run(() => retry.mutateAsync(d.id))}>{T("retry")}</Button>}
                      {!d.approved && d.status !== "PROCESSING" && <Button size="sm" variant="quiet" onClick={() => setConfirm({ doc: d, kind: "delete" })}>{T("delete")}</Button>}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
      )}

      <Panel title={T("testTitle")}>
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(e) => { e.preventDefault(); if (q.trim()) search.mutate({ q: q.trim(), document: scope || undefined }); }}
        >
          <p className="m-0 text-dense text-ink-muted">{T("testHelp")}</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
            <Field label={T("testQuestion")} locale={locale}>{(props) => <Input {...props} value={q} onChange={(e) => setQ(e.target.value)} />}</Field>
            <Field label={T("colTitle")} locale={locale}>
              {(props) => (
                <Select {...props} value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value="">{T("testAll")}</option>
                  {rows.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </Select>
              )}
            </Field>
            <Button type="submit" loading={search.isPending} loadingLabel={T("testRun")}>{T("testRun")}</Button>
          </div>
          {search.isError && <Alert tone="attention" title={T("changeError")} />}
          {search.data && (search.data.length === 0 ? <p role="status" className="m-0 text-dense">{T("testNone")}</p> : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {search.data.map((h, i) => (
                <li key={i} className="rounded-control border border-line p-3 text-dense">
                  <strong>{h.document_name}, {T("page")} {formatDisplayNumber(h.page_number, locale)}</strong>
                  <p className="m-0 mt-1 text-ink-muted">{h.relevant_information.slice(0, 400)}</p>
                </li>
              ))}
            </ul>
          ))}
        </form>
      </Panel>

      {uploading && <UploadDialog locale={locale} onClose={() => setUploading(false)} onUploaded={() => { setUploading(false); docs.refetch(); }} />}
      {approving && (
        <ApproveDialog
          locale={locale}
          doc={approving}
          busy={approve.isPending}
          error={error}
          onClose={() => setApproving(null)}
          onApprove={async (reviewer) => {
            setError(null);
            try {
              await approve.mutateAsync({ id: approving.id, reviewer_name: reviewer, rights_confirmed: true });
              setApproving(null);
              toast({ message: T("saved") });
            } catch (e) { fail(e); }
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={fill(T(confirm.kind === "retire" ? "retireTitle" : "deleteTitle"), { title: confirm.doc.title })}
          description={T(confirm.kind === "retire" ? "retireBody" : "deleteBody")}
          cancelLabel={T("cancel")}
          confirmLabel={T(confirm.kind === "retire" ? "retire" : "delete")}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const { doc, kind } = confirm;
            setConfirm(null);
            void run(() => (kind === "retire" ? retire.mutateAsync(doc.id) : remove.mutateAsync(doc.id)));
          }}
        />
      )}
    </div>
  );
}
