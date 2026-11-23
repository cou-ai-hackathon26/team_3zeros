"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { QueueList } from "@/components/QueueList/QueueList";
import { type LocalePageProps } from "@/app/resolveLocale";
import { usePageLocale } from "@/app/usePageLocale";
import styles from "@/app/[locale]/screens.module.css";

export default function OutgoingReferralsPage({ params }: LocalePageProps) {
  const locale = usePageLocale(params, "en");
  let router: ReturnType<typeof useRouter> | null = null;
  try {
    router = useRouter();
  } catch {
    router = null;
  }

  return (
    <main className={styles.pageShell}>
      <div className={styles.topBar}>
        <h1 className={styles.sectionHeading}>
          {locale === "bn" ? "প্রেরিত রেফারেল তালিকা" : "Outgoing referrals"}
        </h1>
        <a href={`/${locale}/referrals/new`} className={styles.filterChip}>
          {locale === "bn" ? "+ নতুন রেফারেল খসড়া" : "+ New referral draft"}
        </a>
      </div>
      <QueueList
        items={[
          {
            id: "ref-0104",
            patientName: "Karim Uddin, 54",
            patientNameBn: "করিম উদ্দিন",
            reason: "Sent to Tangail District Hospital",
            urgency: "urgent",
            escalated: false,
            createdAt: "2026-11-23T00:30:00Z",
          },
        ]}
        selectedId="ref-0104"
        onSelect={(id) => router?.push(`/${locale}/referrals/${id}`)}
        locale={locale}
      />
    </main>
  );
}
