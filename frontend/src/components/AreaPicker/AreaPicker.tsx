"use client";

import React, { useState } from "react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { useAreaList, type DirectoryArea } from "../../api/queries/hooks";
import { Field } from "../ui/field";

const nativeSelect =
  "h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-body text-ink disabled:cursor-not-allowed disabled:opacity-40";

function LevelSelect({
  level, label, areas, value, onChange, locale, disabled,
}: {
  level: DirectoryArea["level"]; label: string; areas: DirectoryArea[]; value: string; onChange: (v: string) => void; locale: Locale; disabled?: boolean;
}) {
  return (
    <Field label={label} locale={locale}>
      {(p) => (
        <select {...p} className={nativeSelect} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} data-level={level}>
          <option value="">{t(locale, "place.choose")}</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {locale === "bn" && a.name_bn ? a.name_bn : a.name_en}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/**
 * Division → district → upazila with native selects (best on phones). Reports the id of the
 * deepest area chosen, or null when nothing is chosen. Each list loads only after its parent is set.
 */
export function AreaPicker({ locale, onChange }: { locale: Locale; onChange: (areaId: string | null) => void }) {
  const [division, setDivision] = useState("");
  const [district, setDistrict] = useState("");
  const [upazila, setUpazila] = useState("");
  const divisions = useAreaList("division");
  const districts = useAreaList("district", division, !!division);
  const upazilas = useAreaList("upazila", district, !!district);

  return (
    <div className="flex flex-col gap-4">
      <LevelSelect level="division" label={t(locale, "place.division")} areas={divisions.data ?? []} value={division} locale={locale}
        onChange={(v) => { setDivision(v); setDistrict(""); setUpazila(""); onChange(v || null); }} />
      <LevelSelect level="district" label={t(locale, "place.district")} areas={districts.data ?? []} value={district} locale={locale} disabled={!division}
        onChange={(v) => { setDistrict(v); setUpazila(""); onChange(v || division || null); }} />
      <LevelSelect level="upazila" label={t(locale, "place.upazila")} areas={upazilas.data ?? []} value={upazila} locale={locale} disabled={!district}
        onChange={(v) => { setUpazila(v); onChange(v || district || null); }} />
    </div>
  );
}
