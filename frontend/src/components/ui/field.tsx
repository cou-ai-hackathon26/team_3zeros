"use client";

import React, { useId, useState } from "react";
import { Eye, EyeOff, TriangleAlert } from "lucide-react";
import { cn } from "../../lib/cn";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";

const control =
  "w-full rounded-control border border-line-strong bg-surface px-3 text-body text-ink placeholder:text-ink-muted " +
  "aria-[invalid=true]:border-signal disabled:cursor-not-allowed disabled:opacity-40";

export interface FieldProps {
  label: string;
  /** Label of the optional-vs-required marker is the word "required", never an asterisk alone. */
  required?: boolean;
  help?: string;
  error?: string;
  locale: Locale;
  /** Render the control; receives the props that wire it to the label, help and error. */
  children: (control: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: true;
    "aria-required"?: true;
  }) => React.ReactNode;
}

/** DESIGN_SYSTEM §6.3: label above, help, control, error with icon and words. */
export function Field({ label, required, help, error, locale, children }: FieldProps) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-dense font-semibold text-ink">
        {label}
        {required && <span className="ms-2 font-normal text-ink-muted">({t(locale, "common.required")})</span>}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required ? true : undefined,
      })}
      {help && (
        <p id={helpId} className="m-0 text-caption text-ink-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="m-0 flex items-center gap-1.5 text-caption font-medium text-signal">
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { dense?: boolean };

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, dense, ...props },
  ref,
) {
  return <input ref={ref} className={cn(control, dense ? "h-11" : "h-12", className)} {...props} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(control, "min-h-24 py-2", className)} {...props} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} className={cn(control, "h-12", className)} {...props} />;
  },
);

/** Single field for OTP and reference codes: one input handles Bangla digits and paste (AUTH_RBAC §4.1). */
export const CodeInput = React.forwardRef<HTMLInputElement, InputProps>(function CodeInput(
  { className, ...props },
  ref,
) {
  return (
    <Input
      ref={ref}
      inputMode="numeric"
      autoComplete="one-time-code"
      className={cn("text-code font-semibold tabular-nums tracking-widest", className)}
      {...props}
    />
  );
});

export interface PasswordInputProps extends InputProps {
  showLabel: string;
  hideLabel: string;
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { showLabel, hideLabel, className, ...props },
  ref,
) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={shown ? "text" : "password"} className={cn("pe-12", className)} {...props} />
      <button
        type="button"
        aria-pressed={shown}
        aria-label={shown ? hideLabel : showLabel}
        onClick={() => setShown((v) => !v)}
        className="absolute inset-y-0 end-0 flex w-12 items-center justify-center text-ink-muted"
      >
        {shown ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
      </button>
    </div>
  );
});
