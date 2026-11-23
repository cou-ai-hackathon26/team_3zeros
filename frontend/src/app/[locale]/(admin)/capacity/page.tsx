"use client";

import React, { useState } from "react";
import styles from "../../screens.module.css";

/**
 * MASTERPLAN INV-14 & Q-08:
 * Capacity reports always carry their timestamp and reporting source.
 */
export default function AdminCapacityPage() {
  const [bedsText, setBedsText] = useState("General Medicine: 6 beds available; Emergency: open");
  const [submittedAt, setSubmittedAt] = useState("23 Nov 2026, 08:30 (Asia/Dhaka)");

  return (
    <main className={styles.pageShell}>
      <h1 className={styles.sectionHeading}>Capacity report submission (INV-14)</h1>
      <p className={styles.guideNotice}>
        Capacity data always displays its last-updated timestamp and reporting source to patients and referring doctors. It is never shown as live (INV-14).
      </p>
      <form
        className={styles.formStack}
        onSubmit={(e) => {
          e.preventDefault();
          setSubmittedAt("Just now — Tangail District Hospital Admin");
        }}
      >
        <div className={styles.fieldGroup}>
          <label htmlFor="cap-report" className={styles.fieldLabel}>
            Reported service capacity
          </label>
          <input
            id="cap-report"
            type="text"
            value={bedsText}
            onChange={(e) => setBedsText(e.target.value)}
            className={styles.textField}
          />
        </div>
        <div className={styles.capacityMeta}>Last report: {submittedAt}</div>
        <button type="submit" className={styles.primaryCta}>
          Publish dated capacity report
        </button>
      </form>
    </main>
  );
}
