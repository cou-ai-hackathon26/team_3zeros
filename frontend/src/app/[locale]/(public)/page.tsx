import "../../../i18n/landing";
import React from "react";
import type { Metadata } from "next";
import { LandingPage } from "../../../components/landing/LandingPage";
import type { Locale } from "../../../i18n/config";
import { t } from "../../../i18n/format";

type Params = Promise<{ locale: string }>;
const asLocale = (v: string): Locale => (v === "en" ? "en" : "bn");

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  return {
    title: t(locale, "landing.meta.title"),
    description: t(locale, "landing.meta.description"),
    alternates: { canonical: `/${locale}`, languages: { bn: "/bn", en: "/en" } },
  };
}

export default async function HomePage({ params }: { params: Params }) {
  return <LandingPage locale={asLocale((await params).locale)} />;
}
