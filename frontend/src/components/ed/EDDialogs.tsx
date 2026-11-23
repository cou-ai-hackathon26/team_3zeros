"use client";

import React, { useState } from "react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import type { NewEDVisit, DirectoryFacilityEntry } from "../../api/queries/types";
import { Button } from "../ui/button";
import { Field, Input, Select, Textarea } from "../ui/field";
import { Dialog, DialogContent } from "../ui/overlays";
import { DraftBlock } from "../DraftBlock/DraftBlock";
import { Alert } from "../ui/states";

export function FastIntakeDialog({
  locale,
  facilities,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  locale: Locale;
  facilities?: DirectoryFacilityEntry[];
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (v: NewEDVisit) => void;
}) {
  const L = (k: string) => t(locale, `ed.${k}`);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientSex, setPatientSex] = useState<NewEDVisit["patient_sex"]>("unknown");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [arrivalMode, setArrivalMode] = useState<NewEDVisit["arrival_mode"]>("WALK_IN");
  const [pulse, setPulse] = useState("");
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [temperature, setTemperature] = useState("");
  const [spo2, setSpo2] = useState("");
  const [respiratoryRate, setRespiratoryRate] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chiefComplaint.trim()) {
      setValidationError(t(locale, "common.fieldRequired"));
      return;
    }

    const vitals: Record<string, string | number> = {};
    if (pulse) vitals.pulse = pulse;
    if (systolic) vitals.systolic = systolic;
    if (diastolic) vitals.diastolic = diastolic;
    if (temperature) vitals.temperature = temperature;
    if (spo2) vitals.spo2 = spo2;
    if (respiratoryRate) vitals.respiratory_rate = respiratoryRate;

    onSubmit({
      patient_name: patientName.trim() || undefined,
      patient_phone: patientPhone.trim() || undefined,
      patient_sex: patientSex,
      chief_complaint: chiefComplaint.trim(),
      arrival_mode: arrivalMode,
      vitals: Object.keys(vitals).length > 0 ? vitals : undefined,
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={L("intakeModalTitle")} closeLabel={t(locale, "common.close")}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-h-[75vh] overflow-y-auto pe-1">
          <Alert tone="info" title={L("intakeNotice")} />
          {error && <Alert tone="attention" title={error} />}

          <div className="flex flex-col gap-3">
            <h3 className="m-0 text-dense font-semibold text-ink">{L("name")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={L("name")} locale={locale}>
                {(props) => (
                  <Input
                    {...props}
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="e.g. Karim Uddin or Unknown"
                  />
                )}
              </Field>
              <Field label={L("phone")} locale={locale}>
                {(props) => (
                  <Input
                    {...props}
                    value={patientPhone}
                    onChange={(e) => setPatientPhone(e.target.value)}
                    placeholder="017XXXXXXXX"
                  />
                )}
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={L("sex")} locale={locale}>
                {(props) => (
                  <Select
                    {...props}
                    value={patientSex}
                    onChange={(e) => setPatientSex(e.target.value as NewEDVisit["patient_sex"])}
                  >
                    <option value="unknown">{L("unknown")}</option>
                    <option value="male">{L("male")}</option>
                    <option value="female">{L("female")}</option>
                    <option value="other">{L("other")}</option>
                  </Select>
                )}
              </Field>
              <Field label={L("arrivalMode")} locale={locale}>
                {(props) => (
                  <Select
                    {...props}
                    value={arrivalMode}
                    onChange={(e) => setArrivalMode(e.target.value as NewEDVisit["arrival_mode"])}
                  >
                    <option value="WALK_IN">{L("walkIn")}</option>
                    <option value="AMBULANCE">{L("ambulance")}</option>
                    <option value="POLICE">{L("police")}</option>
                    <option value="REFERRAL">{L("referral")}</option>
                    <option value="OTHER">{L("otherMode")}</option>
                  </Select>
                )}
              </Field>
            </div>

            <Field label={L("chiefComplaint")} locale={locale} error={validationError || undefined} required>
              {(props) => (
                <Textarea
                  {...props}
                  value={chiefComplaint}
                  onChange={(e) => {
                    setChiefComplaint(e.target.value);
                    setValidationError(null);
                  }}
                  placeholder="e.g. Severe chest pain radiating to back, shortness of breath"
                  rows={2}
                />
              )}
            </Field>

            <h3 className="m-0 pt-2 text-dense font-semibold text-ink">{L("vitalsTitle")}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Field label={L("pulse")} locale={locale}>
                {(props) => (
                  <Input {...props} type="number" value={pulse} onChange={(e) => setPulse(e.target.value)} placeholder="e.g. 78" />
                )}
              </Field>
              <Field label={L("systolic")} locale={locale}>
                {(props) => (
                  <Input {...props} type="number" value={systolic} onChange={(e) => setSystolic(e.target.value)} placeholder="e.g. 120" />
                )}
              </Field>
              <Field label={L("diastolic")} locale={locale}>
                {(props) => (
                  <Input {...props} type="number" value={diastolic} onChange={(e) => setDiastolic(e.target.value)} placeholder="e.g. 80" />
                )}
              </Field>
              <Field label={L("temperature")} locale={locale}>
                {(props) => (
                  <Input {...props} type="number" step="0.1" value={temperature} onChange={(e) => setTemperature(e.target.value)} placeholder="e.g. 37.0" />
                )}
              </Field>
              <Field label={L("spo2")} locale={locale}>
                {(props) => (
                  <Input {...props} type="number" value={spo2} onChange={(e) => setSpo2(e.target.value)} placeholder="e.g. 98" />
                )}
              </Field>
              <Field label={L("respiratoryRate")} locale={locale}>
                {(props) => (
                  <Input {...props} type="number" value={respiratoryRate} onChange={(e) => setRespiratoryRate(e.target.value)} placeholder="e.g. 18" />
                )}
              </Field>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-line">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              {t(locale, "common.close")}
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              {L("registerArrival")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TriageDialog({
  locale,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  locale: Locale;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (category: string, notes: string, vitals?: Record<string, string>) => void;
}) {
  const L = (k: string) => t(locale, `ed.${k}`);
  const [category, setCategory] = useState("YELLOW");
  const [notes, setNotes] = useState("");
  const [spo2, setSpo2] = useState("");
  const [pulse, setPulse] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const vitals: Record<string, string> = {};
    if (spo2) vitals.spo2 = spo2;
    if (pulse) vitals.pulse = pulse;
    onSubmit(category, notes, Object.keys(vitals).length > 0 ? vitals : undefined);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={L("triageModalTitle")} closeLabel={t(locale, "common.close")}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert tone="attention" title={error} />}

          <Field label={L("triageCategory")} locale={locale} required>
            {(props) => (
              <Select {...props} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="RED">{L("triageRed")}</option>
                <option value="ORANGE">{L("triageOrange")}</option>
                <option value="YELLOW">{L("triageYellow")}</option>
                <option value="GREEN">{L("triageGreen")}</option>
                <option value="BLUE">{L("triageBlue")}</option>
              </Select>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label={L("pulse")} locale={locale}>
              {(props) => <Input {...props} type="number" value={pulse} onChange={(e) => setPulse(e.target.value)} placeholder="e.g. 88" />}
            </Field>
            <Field label={L("spo2")} locale={locale}>
              {(props) => <Input {...props} type="number" value={spo2} onChange={(e) => setSpo2(e.target.value)} placeholder="e.g. 96" />}
            </Field>
          </div>

          <Field label={L("dispositionNotes")} locale={locale}>
            {(props) => (
              <Textarea
                {...props}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Triage assessment details..."
                rows={2}
              />
            )}
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              {t(locale, "common.close")}
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              {t(locale, "action.ed_visit.triage")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AdmitDialog({
  locale,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  locale: Locale;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (notes: string) => void;
}) {
  const L = (k: string) => t(locale, `ed.${k}`);
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(notes.trim());
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={L("admitModalTitle")} closeLabel={t(locale, "common.close")}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert tone="attention" title={error} />}
          <Field label={L("dispositionNotes")} locale={locale}>
            {(props) => (
              <Textarea
                {...props}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ward, bed or admitting department details..."
                rows={3}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              {t(locale, "common.close")}
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              {t(locale, "action.ed_visit.admit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DischargeDialog({
  locale,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  locale: Locale;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (summary: string, notes: string) => void;
}) {
  const L = (k: string) => t(locale, `ed.${k}`);
  const [summary, setSummary] = useState(
    "Patient treated in emergency department. Condition stable, symptom relief achieved. Safe for outpatient discharge with follow-up."
  );
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(summary.trim(), notes.trim());
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={L("dischargeModalTitle")} closeLabel={t(locale, "common.close")}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert tone="attention" title={error} />}

          <div className="flex flex-col gap-2">
            <DraftBlock
              title={L("dischargeSummary")}
              content={summary}
              verified={false}
              locale={locale}
              editable={true}
              onChange={setSummary}
            />
          </div>

          <Field label={L("dispositionNotes")} locale={locale}>
            {(props) => (
              <Textarea
                {...props}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Discharge advice, medication or return instructions..."
                rows={2}
              />
            )}
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              {t(locale, "common.close")}
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              {t(locale, "action.ed_visit.discharge")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TransferDialog({
  locale,
  facilities,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  locale: Locale;
  facilities: DirectoryFacilityEntry[];
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (transferFacilityId: string, notes: string) => void;
}) {
  const L = (k: string) => t(locale, `ed.${k}`);
  const [facilityId, setFacilityId] = useState(facilities[0]?.id || "");
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(facilityId, notes.trim());
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={L("transferModalTitle")} closeLabel={t(locale, "common.close")}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert tone="attention" title={error} />}

          <Field label={L("destinationFacility")} locale={locale} required>
            {(props) => (
              <Select {...props} value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {locale === "bn" && f.name_bn ? f.name_bn : f.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={L("dispositionNotes")} locale={locale}>
            {(props) => (
              <Textarea
                {...props}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Transfer reason, transport requirements, or receiving unit..."
                rows={2}
              />
            )}
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              {t(locale, "common.close")}
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              {t(locale, "action.ed_visit.transfer")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
