"use client";

import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";
import { buttonVariants } from "./button";

// Motion: `state` token (220 ms), functional tier. Durations become 0 under reduced motion.
const anim =
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 " +
  "[animation-duration:var(--motion-state-duration)]";
const overlay = cn("fixed inset-0 z-50 bg-ink/45", anim);
const panelBase = "fixed z-50 bg-surface text-ink shadow-float outline-none";

/** Dialog: centred from `md` up; a bottom sheet below `md`. */
const dialogPosition =
  "inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-tile p-5 " +
  "md:inset-auto md:start-1/2 md:top-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-tile rtl:md:translate-x-1/2";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  closeLabel,
}: {
  className?: string;
  children: React.ReactNode;
  title: string;
  description?: string;
  closeLabel: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlay} />
      <DialogPrimitive.Content className={cn(panelBase, dialogPosition, anim, className)}>
        <DialogPrimitive.Title className="m-0 mb-1 text-heading font-semibold">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="m-0 mb-4 text-dense text-ink-muted">{description}</DialogPrimitive.Description>
        ) : (
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        )}
        {children}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          className="absolute end-3 top-3 flex size-11 items-center justify-center rounded-control text-ink-muted hover:bg-sunken"
        >
          <X aria-hidden className="size-5" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Sheet: bottom on phones (consent, filters, reason entry), right on desktop for context. */
export function SheetContent({
  className,
  children,
  title,
  description,
  closeLabel,
  side = "bottom",
}: {
  className?: string;
  children: React.ReactNode;
  title: string;
  description?: string;
  closeLabel: string;
  side?: "bottom" | "right";
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlay} />
      <DialogPrimitive.Content
        className={cn(
          panelBase,
          anim,
          side === "bottom"
            ? "inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-tile p-5"
            : "inset-y-0 end-0 w-full max-w-md overflow-y-auto p-5",
          className,
        )}
      >
        <DialogPrimitive.Title className="m-0 mb-1 text-heading font-semibold">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="m-0 mb-4 text-dense text-ink-muted">{description}</DialogPrimitive.Description>
        ) : (
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        )}
        {children}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          className="absolute end-3 top-3 flex size-11 items-center justify-center rounded-control text-ink-muted hover:bg-sunken"
        >
          <X aria-hidden className="size-5" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** AlertDialog: confirmation and reason capture. Escape does not dismiss a destructive pending action unless `onEscape` allows it. */
export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;
export const AlertDialogAction = AlertDialogPrimitive.Action;

export function AlertDialogContent({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className={overlay} />
      <AlertDialogPrimitive.Content className={cn(panelBase, dialogPosition, anim, className)}>
        <AlertDialogPrimitive.Title className="m-0 mb-1 text-heading font-semibold">{title}</AlertDialogPrimitive.Title>
        <AlertDialogPrimitive.Description className="m-0 mb-4 text-dense text-ink-muted">{description}</AlertDialogPrimitive.Description>
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
}

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export function DropdownMenuContent({ className, ...props }: React.ComponentProps<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={6}
        className={cn("z-50 min-w-48 rounded-panel border border-line bg-surface p-1 text-dense shadow-float", anim, className)}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof DropdownPrimitive.Item>) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-3 outline-none data-[highlighted]:bg-indigo-wash data-[disabled]:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export function TooltipContent({ className, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={6}
        className={cn("z-50 rounded-control bg-indigo-deep px-2 py-1 text-caption text-brand-foreground", className)}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

/** Cancel/confirm buttons for an AlertDialog, using the shared button styles. */
export const alertCancelClass = buttonVariants({ variant: "secondary" });
export const alertActionClass = (destructive: boolean) => buttonVariants({ variant: destructive ? "danger" : "primary" });
