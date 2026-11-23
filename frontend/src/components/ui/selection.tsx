"use client";

import React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as RadioPrimitive from "@radix-ui/react-radio-group";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

/** Tabs switch views of one object or list. Underline style. */
export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("flex gap-1 overflow-x-auto border-b border-line", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "min-h-11 shrink-0 border-b-2 border-transparent px-3 text-dense font-medium text-ink-muted hover:text-ink " +
          "data-[state=active]:border-indigo data-[state=active]:font-semibold data-[state=active]:text-ink",
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;

/** Filters only. Selected state is shown with a check icon and aria-pressed. */
export function FilterChip({
  pressed,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pressed: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-control border px-3 text-dense",
        pressed ? "border-indigo bg-indigo-wash font-semibold text-ink" : "border-line-strong bg-surface text-ink hover:bg-sunken",
        className,
      )}
      {...props}
    >
      {pressed && <Check aria-hidden className="size-4" />}
      {children}
    </button>
  );
}

/** For 2–3 mutually exclusive views (language, urgency). Not for navigation. */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  value: T;
  onValueChange: (v: T) => void;
  options: { value: T; label: string; lang?: string }[];
  label: string;
  className?: string;
}) {
  return (
    <RadioPrimitive.Root
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      aria-label={label}
      orientation="horizontal"
      className={cn("inline-flex rounded-pill border border-line-strong bg-surface p-0.5", className)}
    >
      {options.map((o) => (
        <RadioPrimitive.Item
          key={o.value}
          value={o.value}
          lang={o.lang}
          className="min-h-10 min-w-16 rounded-pill px-3 text-dense data-[state=checked]:bg-indigo data-[state=checked]:font-semibold data-[state=checked]:text-primary-foreground"
        >
          {o.label}
        </RadioPrimitive.Item>
      ))}
    </RadioPrimitive.Root>
  );
}

export const RadioGroup = RadioPrimitive.Root;
export function RadioItem({ value, label, className }: { value: string; label: string; className?: string }) {
  const id = React.useId();
  return (
    <div className={cn("flex min-h-11 items-center gap-3", className)}>
      <RadioPrimitive.Item
        id={id}
        value={value}
        className="flex size-6 shrink-0 items-center justify-center rounded-pill border border-line-strong bg-surface data-[state=checked]:border-indigo"
      >
        <RadioPrimitive.Indicator className="size-3 rounded-pill bg-indigo" />
      </RadioPrimitive.Item>
      <label htmlFor={id} className="flex-1 cursor-pointer text-body">
        {label}
      </label>
    </div>
  );
}

export function Checkbox({ label, className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root> & { label: string }) {
  const id = React.useId();
  return (
    <div className={cn("flex min-h-11 items-center gap-3", className)}>
      <CheckboxPrimitive.Root
        id={id}
        className="flex size-6 shrink-0 items-center justify-center rounded-control border border-line-strong bg-surface data-[state=checked]:border-indigo data-[state=checked]:bg-indigo data-[state=checked]:text-primary-foreground"
        {...props}
      >
        <CheckboxPrimitive.Indicator>
          <Check aria-hidden className="size-4" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <label htmlFor={id} className="flex-1 cursor-pointer text-body">
        {label}
      </label>
    </div>
  );
}

export function Switch({ label, className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root> & { label: string }) {
  const id = React.useId();
  return (
    <div className={cn("flex min-h-11 items-center gap-3", className)}>
      <SwitchPrimitive.Root
        id={id}
        className="relative h-7 w-12 shrink-0 rounded-pill border border-line-strong bg-sunken data-[state=checked]:border-indigo data-[state=checked]:bg-indigo"
        {...props}
      >
        <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-pill bg-surface shadow-raised transition-transform duration-[var(--motion-feedback-duration)] data-[state=checked]:translate-x-6" />
      </SwitchPrimitive.Root>
      <label htmlFor={id} className="flex-1 cursor-pointer text-body">
        {label}
      </label>
    </div>
  );
}

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "flex h-12 w-full items-center justify-between gap-2 rounded-control border border-line-strong bg-surface px-3 text-start text-body text-ink " +
          "aria-[invalid=true]:border-signal data-[placeholder]:text-ink-muted disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronDown aria-hidden className="size-4" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}
export function SelectContent({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className={cn("z-50 min-w-[var(--radix-select-trigger-width)] rounded-panel border border-line bg-surface p-1 shadow-float", className)}
        {...props}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}
export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-3 text-body outline-none data-[highlighted]:bg-indigo-wash data-[disabled]:opacity-40",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="ms-auto">
        <Check aria-hidden className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
