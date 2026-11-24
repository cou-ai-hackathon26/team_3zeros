"use client";

import React from "react";
import type { Locale } from "../../i18n/config";
import "../../i18n/call";
import { t } from "../../i18n/format";
import { toBanglaDigits } from "../../i18n/format";

/** "Question 3 of about 7": text only, no animation. `answered` is how many answers the patient has given. */
export function InterviewProgress({ answered, target, max, language }: { answered: number; target: number; max: number; language: Locale }) {
  const num = (n: number) => (language === "bn" ? toBanglaDigits(String(n)) : String(n));
  const text = t(language, "call.progress").replace("{n}", num(Math.min(answered + 1, max))).replace("{total}", num(target));
  return <p className="m-0 text-caption font-medium text-ink-muted">{text}</p>;
}
