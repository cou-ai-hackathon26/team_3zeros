"use client";

import React, { useState } from "react";
import type { Locale } from "../../i18n/config";
import { normalizeDigits, t } from "../../i18n/format";
import styles from "./ReportViewer.module.css";

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

  const activeField = editedFields.find((f) => f.id === activeFieldId) ?? null;

  function updateFieldValue(id: string, nextVal: string) {
    setEditedFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, value: normalizeDigits(nextVal) } : f))
    );
  }

  return (
    <div className={styles.splitView}>
      <div className={styles.documentPane}>
        <div className={styles.toolbar}>
          <span className={styles.filename}>{filename}</span>
          <div className={styles.zoomControls}>
            <button type="button" onClick={() => setZoom((z) => Math.max(50, z - 25))}>
              −
            </button>
            <span>{zoom}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(200, z + 25))}>
              +
            </button>
          </div>
        </div>

        <div
          className={styles.canvasArea}
          data-url={documentUrl}
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top left" }}
        >
          {activeField && (
            <div
              className={styles.bboxHighlight}
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
      </div>

      <div className={styles.fieldsPane}>
        <table className={styles.table}>
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
                    className={field.id === activeFieldId ? styles.activeRow : ""}
                    onClick={() => setActiveFieldId(field.id)}
                  >
                    <td className={styles.testName}>{field.name}</td>
                    <td>
                      <input
                        type="text"
                        aria-label={field.name}
                        value={field.value}
                        onChange={(e) => updateFieldValue(field.id, e.target.value)}
                        className={styles.valueInput}
                      />
                    </td>
                    <td className={styles.unitCell}>{field.unit}</td>
                    <td>
                      {isLowConfidence && (
                        <span className={styles.checkMarker}>
                          {t(locale, "clinician.checkThis")}
                        </span>
                      )}
                    </td>
                  </tr>
                  {priors.length > 0 && (
                    <tr className={styles.priorRow}>
                      <td colSpan={4}>
                        {priors.map((pr, idx) => (
                          <div key={idx} className={styles.priorItem}>
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

        <div className={styles.actions}>
          {onReject && (
            <button type="button" className={styles.rejectBtn} onClick={onReject}>
              {t(locale, "action.document.reject")}
            </button>
          )}
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={() => onVerify(editedFields)}
          >
            {t(locale, "action.document.verify")}
          </button>
        </div>
      </div>
    </div>
  );
}
