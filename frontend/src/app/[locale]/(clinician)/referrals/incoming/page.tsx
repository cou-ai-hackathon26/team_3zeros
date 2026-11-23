"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { QueueList } from "@/components/QueueList/QueueList";
import { type LocalePageProps } from "@/app/resolveLocale";
import { usePageLocale } from "@/app/usePageLocale";
import styles from "@/app/[locale]/screens.module.css";

export default function IncomingReferralsPage({ params }: LocalePageProps) {
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
          {locale === "bn" ? "আগত রেফারেল তালিকা" : "Incoming referrals"}
        </h1>
        <a href={`/${locale}/referrals/ref-0104`} className={styles.filterChip}>
          {locale === "bn" ? "রেফারেল ওয়ার্কস্পেস খুলুন" : "Open selected referral"}
        </a>
      </div>
      <QueueList
        items={[
          {
            id: "ref-0104",
            patientName: "Karim Uddin, 54",
            patientNameBn: "করিম উদ্দিন",
            reason: "Persistent fever & anemia — Mirzapur UHC",
            urgency: "urgent",
            escalated: false,
            createdAt: "2026-11-23T00:30:00Z",
          },
          {
            id: "ref-0105",
            patientName: "Nasima Begum, 41",
            patientNameBn: "নাসিমা বেগম",
            reason: "Acute chest pain — emergency transfer",
            urgency: "emergency",
            escalated: true,
            escalatedAt: "2026-11-23T01:10:00Z",
            createdAt: "2026-11-23T00:45:00Z",
          },
        ]}
        selectedId="ref-0104"
        onSelect={(id) => router?.push(`/${locale}/referrals/${id}`)}
        locale={locale}
      />
    </main>
  );
}
