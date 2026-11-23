"use client";

import React from "react";
import type { Locale } from "../../i18n/config";
import "../../i18n/call";
import { t } from "../../i18n/format";
import type { TriageCaptionEvent } from "../../voice/types";
import { cn } from "../../lib/cn";

/** Last two caption lines: the spoken language large, the machine translation small beneath it. */
export function CallCaptions({ turns, language }: { turns: TriageCaptionEvent[]; language: Locale }) {
  const last = turns.slice(-2);
  return (
    <div role="log" aria-live="polite" aria-label={t(language, "call.captions")} className="flex min-h-40 w-full flex-col justify-end gap-4 px-2 text-center">
      {last.map((c) => (
        <div key={`${c.at}-${c.role}`} className={cn(c.role === "patient" && "opacity-70")}>
          <p lang={c.lang} className={cn("text-balance", c.role === "assistant" ? "text-heading font-semibold text-ink" : "text-body text-ink-muted")}>
            {c.text}
          </p>
          {c.translation && (
            <p lang={c.translation.lang} className="mt-1 text-dense text-ink-muted">
              {c.translation.text}
              <span className="ms-2 rounded-control border border-line px-1.5 py-0.5 text-caption">{t(language, "call.translated")}</span>
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
