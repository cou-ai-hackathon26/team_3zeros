"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Locale } from "../../i18n/config";
import styles from "./LanguageSwitch.module.css";

export interface LanguageSwitchProps {
  locale: Locale;
  onChange?: (nextLocale: Locale) => void;
}

/**
 * UIUX §3.4 & §5:
 * Full-pill বাংলা / English switcher; sets lang attributes on mixed-language fragments (§8)
 * and navigates to the matching /[locale]/... route when used inside Next.js App Router.
 */
export function LanguageSwitch({ locale, onChange }: LanguageSwitchProps) {
  let pathname: string | null = null;
  let router: ReturnType<typeof useRouter> | null = null;
  try {
    pathname = usePathname();
    router = useRouter();
  } catch {
    pathname = null;
    router = null;
  }

  function handleSelect(nextLocale: Locale) {
    onChange?.(nextLocale);
    if (pathname && router) {
      const segments = pathname.split("/").filter(Boolean);
      if (segments[0] === "bn" || segments[0] === "en") {
        segments[0] = nextLocale;
        router.push(`/${segments.join("/")}`);
      } else {
        router.push(`/${nextLocale}${pathname === "/" ? "" : pathname}`);
      }
    }
  }

  return (
    <div className={styles.pill} role="group" aria-label="Language switch">
      <button
        type="button"
        lang="bn"
        aria-pressed={locale === "bn"}
        className={`${styles.option} ${locale === "bn" ? styles.active : ""}`}
        onClick={() => handleSelect("bn")}
      >
        বাংলা
      </button>
      <button
        type="button"
        lang="en"
        aria-pressed={locale === "en"}
        className={`${styles.option} ${locale === "en" ? styles.active : ""}`}
        onClick={() => handleSelect("en")}
      >
        English
      </button>
    </div>
  );
}
