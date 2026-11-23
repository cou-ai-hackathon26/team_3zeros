"use client";

import React from "react";
import styles from "../../screens.module.css";

export default function AdminSchedulesPage() {
  return (
    <main className={styles.pageShell}>
      <h1 className={styles.sectionHeading}>Practitioner slot schedules</h1>
      <ul className={styles.plainList}>
        <li className={styles.plainListRow}>
          <div className={styles.doctorTitle}>Dr. Rahima Khatun (BMDC A-44219) — Medicine</div>
          <div>Thursday: 09:00 – 13:00 (16 slots AVAILABLE, 2 HELD)</div>
        </li>
        <li className={styles.plainListRow}>
          <div className={styles.doctorTitle}>Dr. Mahmudul Hasan (BMDC A-51084) — Pediatrics</div>
          <div>Friday: 09:00 – 12:30 (14 slots AVAILABLE)</div>
        </li>
      </ul>
    </main>
  );
}
