"use client";

import React from "react";
import type { Locale } from "../../i18n/config";
import { formatDhakaDateTime } from "../../i18n/format";
import { Button } from "../ui/button";
import { DescriptionList } from "../ui/surfaces";

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

  const bn = locale === "bn";
  const items = [
    { label: bn ? "যিনি পাবেন" : "Who will receive", value: recipientDisplay },
    { label: bn ? "কেন প্রয়োজন" : "Purpose", value: purpose },
    {
      label: bn ? "যেসব তথ্য শেয়ার হবে" : "Included categories",
      value: (
        <ul className="m-0 list-disc ps-5">
          {categories.map((cat) => (
            <li key={cat}>{cat}</li>
          ))}
        </ul>
      ),
    },
    ...(expiresAt ? [{ label: bn ? "মেয়াদ" : "Valid until", value: formatDhakaDateTime(expiresAt, locale) }] : []),
  ];

  return (
    <section className="flex flex-col gap-4 rounded-tile border border-line bg-surface p-5 text-ink">
      <h2 className="m-0 font-serif text-title">
        {bn ? "চিকিৎসা তথ্য শেয়ারের অনুমতি" : "Permission to share your health record"}
      </h2>

      <DescriptionList items={items} />

      <p className="m-0 text-dense text-ink-muted">
        {bn
          ? "আপনি শেয়ার না করলে আপনার বর্তমান ডাক্তারকে জানানো হবে এবং এই তথ্য অন্য হাসপাতালে পাঠানো হবে না।"
          : "If you choose not to share, your sending doctor will be notified and your record will not be sent."}
      </p>

      {/* INV-10: equal weight. Same variant and size for both decisions. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button variant="secondary" size="lg" onClick={onRefuse}>
          {refuseLabel}
        </Button>
        <Button variant="secondary" size="lg" onClick={onGrant}>
          {shareLabel}
        </Button>
      </div>
    </section>
  );
}
