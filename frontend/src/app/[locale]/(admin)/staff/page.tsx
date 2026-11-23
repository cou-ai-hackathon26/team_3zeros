"use client";

import React from "react";
import styles from "../../screens.module.css";

export default function AdminStaffPage() {
  return (
    <main className={styles.pageShell}>
      <h1 className={styles.sectionHeading}>Staff accounts & memberships</h1>
      <ul className={styles.plainList}>
        <li className={styles.plainListRow}>
          <div className={styles.doctorTitle}>Dr. Rahima Khatun — Clinician</div>
          <div className={styles.capacityMeta}>
            BMDC: A-44219 — Permissions: referral.approve, referral.acknowledge, schedule.manage
          </div>
        </li>
        <li className={styles.plainListRow}>
          <div className={styles.doctorTitle}>Farhana Akter — Facility Staff (Emergency Desk)</div>
          <div className={styles.capacityMeta}>
            Permissions: emergency.create, referral.acknowledge, schedule.manage
          </div>
        </li>
      </ul>
    </main>
  );
}
