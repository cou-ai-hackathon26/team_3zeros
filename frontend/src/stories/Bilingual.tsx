import React from "react";
import type { Locale } from "../i18n/config";

/** Renders the same story in Bangla and English, one above the other. */
export function Bilingual({ children }: { children: (locale: Locale) => React.ReactNode }) {
  return (
    <div className="flex flex-col gap-8">
      {(["bn", "en"] as const).map((l) => (
        <div key={l} lang={l} className="flex flex-col gap-2">
          <p className="m-0 text-caption text-ink-muted">{l === "bn" ? "বাংলা" : "English"}</p>
          {children(l)}
        </div>
      ))}
    </div>
  );
}
