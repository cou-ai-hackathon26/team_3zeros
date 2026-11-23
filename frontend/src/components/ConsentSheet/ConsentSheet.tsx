"use client";

import React from "react";
import type { Locale } from "../../i18n/config";
import { formatDhakaDateTime } from "../../i18n/format";
import styles from "./ConsentSheet.module.css";

export interface ConsentSheetProps {
  recipientPractitioner?: string | null;
  recipientFacility: string;
  purpose: string;
  categories: string[];
  expiresAt?: string | null;
  locale: Locale;
  onGrant: () => void;
  onRefuse: () => void;
}

/**
 * UIUX §5 & §6.7 (INV-10):
 * Shows who will receive, why, which categories, and how long.
 * Two equal-sized buttons: "Share with Dr. …" and "Don't share".
 * Refusing explains what happens next.
 */
export function ConsentSheet({
  recipientPractitioner,
  recipientFacility,
  purpose,
  categories,
  expiresAt,
  locale,
  onGrant,
  onRefuse,
}: ConsentSheetProps) {
  const recipientDisplay = recipientPractitioner
    ? `${recipientPractitioner} (${recipientFacility})`
    : recipientFacility;

  const shareLabel =
    locale === "bn"
      ? `${recipientPractitioner ?? recipientFacility}-এর সাথে শেয়ার করুন`
      : `Share with ${recipientPractitioner ?? recipientFacility}`;

  const refuseLabel = locale === "bn" ? "শেয়ার করবেন না" : "Don't share";

  return (
    <section className={styles.sheet}>
      <h2 className={styles.heading}>
        {locale === "bn" ? "চিকিৎসা তথ্য শেয়ারের অনুমতি" : "Permission to share your health record"}
      </h2>

      <dl className={styles.details}>
        <div className={styles.row}>
          <dt>{locale === "bn" ? "যিনি পাবেন" : "Who will receive"}</dt>
          <dd>{recipientDisplay}</dd>
        </div>
        <div className={styles.row}>
          <dt>{locale === "bn" ? "কেন প্রয়োজন" : "Purpose"}</dt>
          <dd>{purpose}</dd>
        </div>
        <div className={styles.row}>
          <dt>{locale === "bn" ? "যেসব তথ্য শেয়ার হবে" : "Included categories"}</dt>
          <dd>
            <ul className={styles.categoryList}>
              {categories.map((cat) => (
                <li key={cat}>{cat}</li>
              ))}
            </ul>
          </dd>
        </div>
        {expiresAt && (
          <div className={styles.row}>
            <dt>{locale === "bn" ? "মেয়াদ" : "Valid until"}</dt>
            <dd>{formatDhakaDateTime(expiresAt, locale)}</dd>
          </div>
        )}
      </dl>

      <p className={styles.refusalExplainer}>
        {locale === "bn"
          ? "আপনি শেয়ার না করলে আপনার বর্তমান ডাক্তারকে জানানো হবে এবং এই তথ্য অন্য হাসপাতালে পাঠানো হবে না।"
          : "If you choose not to share, your sending doctor will be notified and your record will not be sent."}
      </p>

      <div className={styles.equalButtons}>
        <button type="button" className={styles.refuseBtn} onClick={onRefuse}>
          {refuseLabel}
        </button>
        <button type="button" className={styles.grantBtn} onClick={onGrant}>
          {shareLabel}
        </button>
      </div>
    </section>
  );
}
