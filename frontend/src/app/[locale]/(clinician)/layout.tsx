"use client";

import React from "react";
import { useSession } from "../../../auth/session";
import { SiteNav } from "../../../components/SiteNav/SiteNav";
import styles from "../screens.module.css";

/**
 * UIUX §6.8 & SECURITY §3.3:
 * Clinician workspace shell with active facility switcher top-left and always-visible Sign out.
 */
export default function ClinicianLayout({ children }: { children: React.ReactNode }) {
  const { me, switchFacility, signOut } = useSession();

  return (
    <div data-route-group="clinician">
      <SiteNav
        area="clinician"
        facilitySlot={
          <div className={styles.facilityControlGroup}>
            <label className={styles.facilityLabel}>
              <span>Facility:</span>
              <select
                aria-label="Active facility switcher"
                value={me?.active_facility?.id ?? "fac-1"}
                onChange={(e) => switchFacility(e.target.value)}
                className={styles.filterChip}
              >
                <option value="fac-1">
                  {me?.active_facility?.name ?? "Tangail District Hospital"}
                </option>
                <option value="fac-2">Mirzapur Upazila Health Complex</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => signOut()}
              className={styles.filterChip}
            >
              Sign out
            </button>
          </div>
        }
      />
      {children}
    </div>
  );
}
