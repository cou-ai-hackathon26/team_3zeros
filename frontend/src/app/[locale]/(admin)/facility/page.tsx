"use client";

import React, { useState } from "react";
import styles from "../../screens.module.css";

export default function AdminFacilityPage() {
  const [address, setAddress] = useState("Sadar Hospital Road, Tangail");
  const [saved, setSaved] = useState(false);

  return (
    <main className={styles.pageShell}>
      <h1 className={styles.sectionHeading}>Facility directory & services</h1>

      <ul className={styles.plainList}>
        <li className={styles.plainListRow}>
          <div className={styles.doctorTitle}>
            Tangail District Hospital (টাঙ্গাইল জেলা হাসপাতাল)
          </div>
          <p className={styles.capacityMeta}>
            Type: District Hospital — Division: Dhaka › District: Tangail
          </p>
          <div>Active departments: Medicine, Pediatrics, Obstetrics, Emergency</div>
        </li>
      </ul>

      <form
        className={styles.formStack}
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(true);
        }}
      >
        <div className={styles.fieldGroup}>
          <label htmlFor="fac-address" className={styles.fieldLabel}>
            Facility address & emergency contact
          </label>
          <input
            id="fac-address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={styles.textField}
          />
        </div>
        <button type="submit" className={styles.primaryCta}>
          Save directory update
        </button>
        {saved && <p className={styles.capacityMeta}>Directory changes saved.</p>}
      </form>
    </main>
  );
}
