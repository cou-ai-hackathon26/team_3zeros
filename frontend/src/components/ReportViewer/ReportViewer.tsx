"use client";

import React, { useState } from "react";
import type { Locale } from "../../i18n/config";
import { normalizeDigits, t } from "../../i18n/format";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/selection";

export interface ExtractedCandidateField {
  id: string;
  name: string;
  value: string;
  unit: string;
  observedDate: string;
  lab: string;
  confidence: number;
  page: number;
  bbox: [number, number, number, number];
}

export interface PriorTestResult {
  value: string;
  unit: string;
  date: string;
  lab: string;
}

export interface ReportViewerProps {
  documentUrl: string;
  filename: string;
  fields: ExtractedCandidateField[];
  priorResults: Record<string, PriorTestResult[]>;
  locale: Locale;
  onVerify: (correctedFields: ExtractedCandidateField[]) => void;
  onReject?: () => void;
}

/**
 * UIUX §5, §6.9 & MASTERPLAN INV-15:
 * - Split view: original report (zoomable, page thumbnails, bounding box highlight) left;
 *   extracted fields right as a table.
 * - Low-confidence rows (< 0.85) show "Check this" markers, never percentages.
 * - Earlier results for the same test appear under each row with date and lab (INV-15).
 */
export function ReportViewer({
  documentUrl,
  filename,
  fields,
  priorResults,
  locale,
  onVerify,
  onReject,
}: ReportViewerProps) {
  const [editedFields, setEditedFields] = useState<ExtractedCandidateField[]>(fields);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(fields[0]?.id ?? null);
  const [zoom, setZoom] = useState(100);
  // Below lg the two panes become tabs (DESIGN: tabbed layout below lg).
  const [pane, setPane] = useState<"report" | "values">("values");

  const activeField = editedFields.find((f) => f.id === activeFieldId) ?? null;

  function updateFieldValue(id: string, nextVal: string) {
    setEditedFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, value: normalizeDigits(nextVal) } : f))
    );
  }

  return (
    <Tabs
      value={pane}
      onValueChange={(v) => setPane(v as "report" | "values")}
      className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2"
    >
      <TabsList className="lg:hidden">
        <TabsTrigger value="report">{locale === "bn" ? "রিপোর্ট" : "Report"}</TabsTrigger>
        <TabsTrigger value="values">{locale === "bn" ? "মান" : "Values"}</TabsTrigger>
      </TabsList>
      <TabsContent value="report" forceMount className="m-0 rounded-panel border border-line bg-surface p-4 lg:block">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <span className="text-dense font-semibold">{filename}</span>
          <div className="inline-flex items-center gap-2 tabular-nums">
            <Button size="sm" variant="secondary" aria-label={locale === "bn" ? "ছোট করুন" : "Zoom out"} onClick={() => setZoom((z) => Math.max(50, z - 25))}>
              −
            </Button>
            <span>{zoom}%</span>
            <Button size="sm" variant="secondary" aria-label={locale === "bn" ? "বড় করুন" : "Zoom in"} onClick={() => setZoom((z) => Math.min(200, z + 25))}>
              +
            </Button>
          </div>
        </div>

        <div
          className="relative mt-3 min-h-72 rounded-control bg-sunken"
          data-url={documentUrl}
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top left" }}
        >
          {activeField && (
            <div
              role="img"
              className="pointer-events-none absolute border-2 border-indigo"
              style={{
                left: `${activeField.bbox[0] * 100}%`,
                top: `${activeField.bbox[1] * 100}%`,
                width: `${(activeField.bbox[2] - activeField.bbox[0]) * 100}%`,
                height: `${(activeField.bbox[3] - activeField.bbox[1]) * 100}%`,
              }}
              aria-label={`Highlighted source region for ${activeField.name}`}
            />
          )}
        </div>
      </TabsContent>

      <TabsContent value="values" forceMount className="m-0 rounded-panel border border-line bg-surface p-4 lg:block">
        <table className="w-full border-collapse text-dense [&_td]:border-b [&_td]:border-line [&_td]:p-2 [&_th]:border-b [&_th]:border-line [&_th]:p-2 [&_th]:text-start">
          <thead>
            <tr>
              <th>{locale === "bn" ? "পরীক্ষা" : "Test"}</th>
              <th>{locale === "bn" ? "মান" : "Value"}</th>
              <th>{locale === "bn" ? "একক" : "Unit"}</th>
              <th>{locale === "bn" ? "যাচাই" : "Review"}</th>
            </tr>
          </thead>
          <tbody>
            {editedFields.map((field) => {
              const isLowConfidence = field.confidence < 0.85;
              const priors = priorResults[field.name] ?? [];
              return (
                <React.Fragment key={field.id}>
                  <tr
                    className={field.id === activeFieldId ? "bg-indigo-wash" : ""}
                    onClick={() => setActiveFieldId(field.id)}
                  >
                    <td className="font-medium">{field.name}</td>
                    <td>
                      <input
                        type="text"
                        aria-label={field.name}
                        value={field.value}
                        onChange={(e) => updateFieldValue(field.id, e.target.value)}
                        className="h-11 w-28 rounded-control border border-line-strong bg-surface px-2 tabular-nums"
                      />
                    </td>
                    <td className="text-ink-muted">{field.unit}</td>
                    <td>
                      {isLowConfidence && (
                        <span className="inline-block rounded-control border-[1.5px] border-dashed border-draft px-2 py-0.5 text-caption font-semibold text-draft">
                          {t(locale, "clinician.checkThis")}
                        </span>
                      )}
                    </td>
                  </tr>
                  {priors.length > 0 && (
                    <tr className="[&_td]:bg-sunken [&_td]:text-caption [&_td]:text-ink-muted">
                      <td colSpan={4}>
                        {priors.map((pr, idx) => (
                          <div key={idx} className="flex justify-between gap-3">
                            <span>
                              {locale === "bn" ? "পূর্ববর্তী ফলাফল:" : "Earlier result:"}{" "}
                              <strong>
                                {pr.value} {pr.unit}
                              </strong>
                            </span>
                            <span>
                              {pr.date}, {pr.lab}
                            </span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end gap-3">
          {onReject && (
            <Button variant="secondary" onClick={onReject}>
              {t(locale, "action.document.reject")}
            </Button>
          )}
          <Button onClick={() => onVerify(editedFields)}>{t(locale, "action.document.verify")}</Button>
        </div>
      </TabsContent>
    </Tabs>
  );
}
