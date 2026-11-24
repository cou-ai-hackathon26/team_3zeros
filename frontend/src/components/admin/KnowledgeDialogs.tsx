"use client";

import React, { useState } from "react";
import { uploadWithProgress } from "../../api/upload";
import { ApiError } from "../../api/client";
import type { KnowledgeDocument } from "../../api/queries/hooks";
import type { Locale } from "../../i18n/config";
import "../../i18n/knowledge";
import { t } from "../../i18n/format";
import { fill } from "../../features/patient/display";
import { Button } from "../ui/button";
import { Field, Input, Select, Textarea } from "../ui/field";
import { Dialog, DialogContent } from "../ui/overlays";

const L = (locale: Locale) => (k: string) => t(locale, `knowledge.${k}`);

/** Upload a PDF with byte progress (D-29). The book is processed in the background and is not searchable until approved. */
export function UploadDialog({ locale, onClose, onUploaded }: { locale: Locale; onClose: () => void; onUploaded: () => void }) {
  const T = L(locale);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [publisher, setPublisher] = useState("");
  const [version, setVersion] = useState("");
  const [language, setLanguage] = useState("en");
  const [rights, setRights] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [errors, setErrors] = useState<{ file?: string; title?: string; form?: string }>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = { file: file ? undefined : T("fileRequired"), title: title.trim() ? undefined : T("titleRequired") };
    if (next.file || next.title) return setErrors(next);
    setErrors({});
    const form = new FormData();
    form.append("file", file!);
    form.append("title", title.trim());
    form.append("publisher", publisher);
    form.append("version", version);
    form.append("language", language);
    form.append("rights_statement", rights);
    setProgress(0);
    try {
      await uploadWithProgress("/admin/knowledge/documents", form, setProgress);
      onUploaded();
    } catch (err) {
      setProgress(null);
      setErrors({ form: err instanceof ApiError && err.message ? err.message : T("uploadFailed") });
    }
  }

  const busy = progress !== null;
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent title={T("uploadTitle")} closeLabel={T("cancel")}>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label={T("file")} locale={locale} error={errors.file} required>
            {(props) => <input {...props} type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-body" />}
          </Field>
          <Field label={T("titleField")} locale={locale} error={errors.title} required>
            {(props) => <Input {...props} value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} />}
          </Field>
          <Field label={T("publisher")} locale={locale}>{(props) => <Input {...props} value={publisher} disabled={busy} onChange={(e) => setPublisher(e.target.value)} />}</Field>
          <Field label={T("version")} locale={locale}>{(props) => <Input {...props} value={version} disabled={busy} onChange={(e) => setVersion(e.target.value)} />}</Field>
          <Field label={T("language")} locale={locale}>
            {(props) => (
              <Select {...props} value={language} disabled={busy} onChange={(e) => setLanguage(e.target.value)}>
                <option value="en">{T("langEn")}</option>
                <option value="bn">{T("langBn")}</option>
              </Select>
            )}
          </Field>
          <Field label={T("rights")} locale={locale} help={T("rightsHelp")}>
            {(props) => <Textarea {...props} rows={2} value={rights} disabled={busy} onChange={(e) => setRights(e.target.value)} />}
          </Field>
          {errors.form && <p role="alert" className="m-0 text-dense font-semibold text-attention">{errors.form}</p>}
          {busy && (
            <div className="flex flex-col gap-1">
              <progress max={1} value={progress ?? 0} className="h-2 w-full" aria-label={fill(T("uploading"), { percent: Math.round((progress ?? 0) * 100) })} />
              <p role="status" className="m-0 text-caption text-ink-muted">{fill(T("uploading"), { percent: Math.round((progress ?? 0) * 100) })}</p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="quiet" type="button" onClick={onClose} disabled={busy}>{T("cancel")}</Button>
            <Button type="submit" loading={busy} loadingLabel={fill(T("uploading"), { percent: Math.round((progress ?? 0) * 100) })}>{T("upload")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Approval records the named clinical reviewer and that the rights to the book are confirmed (anti-drift rule 5). */
export function ApproveDialog({ locale, doc, busy, error, onClose, onApprove }: {
  locale: Locale; doc: KnowledgeDocument; busy: boolean; error?: string | null; onClose: () => void; onApprove: (reviewer: string) => void;
}) {
  const T = L(locale);
  const [reviewer, setReviewer] = useState("");
  const [rights, setRights] = useState(false);
  const [errors, setErrors] = useState<{ reviewer?: string; rights?: string }>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = { reviewer: reviewer.trim() ? undefined : T("reviewerRequired"), rights: rights ? undefined : T("rightsRequired") };
    if (next.reviewer || next.rights) return setErrors(next);
    onApprove(reviewer.trim());
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={fill(T("approveTitle"), { title: doc.title })} closeLabel={T("cancel")}>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <p className="m-0 text-dense text-ink-muted">{T("approveHelp")}</p>
          <Field label={T("reviewer")} locale={locale} error={errors.reviewer} required>
            {(props) => <Input {...props} value={reviewer} onChange={(e) => { setReviewer(e.target.value); setErrors({}); }} />}
          </Field>
          <div className="flex flex-col gap-1">
            <label className="flex items-start gap-2 text-body">
              <input type="checkbox" checked={rights} onChange={(e) => { setRights(e.target.checked); setErrors({}); }} className="mt-1 size-4" />
              <span>{T("rightsConfirm")}</span>
            </label>
            {errors.rights && <p role="alert" className="m-0 text-caption font-semibold text-attention">{errors.rights}</p>}
          </div>
          {error && <p role="alert" className="m-0 text-dense font-semibold text-attention">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="quiet" type="button" onClick={onClose}>{T("cancel")}</Button>
            <Button type="submit" loading={busy} loadingLabel={T("approve")}>{T("approve")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
