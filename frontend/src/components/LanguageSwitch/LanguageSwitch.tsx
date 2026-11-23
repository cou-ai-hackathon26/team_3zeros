"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Locale } from "../../i18n/config";
import { SegmentedControl } from "../ui/selection";

export interface LanguageSwitchProps {
  locale: Locale;
  onChange?: (nextLocale: Locale) => void;
}

/**
 * বাংলা / English switch (a SegmentedControl). Navigates to the matching
 * /[locale]/... route when used inside the Next.js App Router.
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
    <SegmentedControl
      label="Language"
      value={locale}
      onValueChange={handleSelect}
      options={[
        { value: "bn", label: "বাংলা", lang: "bn" },
        { value: "en", label: "English", lang: "en" },
      ]}
    />
  );
}
