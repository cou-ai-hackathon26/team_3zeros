"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Locale } from "../../i18n/config";
import { cn } from "../../lib/cn";

export interface LanguageSwitchProps {
  locale: Locale;
  onChange?: (nextLocale: Locale) => void;
}

const OPTIONS: { value: Locale; label: string }[] = [
  { value: "bn", label: "বাংলা" },
  { value: "en", label: "English" },
];

/**
 * বাংলা / English switch. Plain pressed-state buttons rather than a Radix radio group: this
 * component is in every shell, and the patient routes have a 170 KB budget (FRONTEND §11). Navigates to the matching
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
    <div role="group" aria-label="Language" className="inline-flex rounded-pill border border-line-strong bg-surface p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          lang={o.value}
          aria-pressed={locale === o.value}
          onClick={() => handleSelect(o.value)}
          className={cn(
            "min-h-10 min-w-16 rounded-pill px-3 text-dense",
            locale === o.value ? "bg-indigo font-semibold text-primary-foreground" : "text-ink hover:bg-sunken",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
