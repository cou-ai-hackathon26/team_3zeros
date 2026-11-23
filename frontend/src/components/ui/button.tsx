import React from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader } from "lucide-react";
import { cn } from "../../lib/cn";

/** DESIGN_SYSTEM §6.2. One `primary` per view; `danger` for destructive confirmation and the emergency call only. */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-control font-semibold no-underline cursor-pointer select-none " +
    "transition-colors duration-[var(--motion-feedback-duration)] ease-[var(--motion-feedback-easing)] " +
    "disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-indigo-hover",
        secondary: "border border-line-strong bg-surface text-ink hover:bg-sunken",
        quiet: "bg-transparent text-indigo hover:bg-indigo-wash",
        danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        "on-brand": "bg-paddy text-indigo-deep hover:bg-paddy/90 focus-visible:outline-paddy",
      },
      size: {
        lg: "h-13 px-6 text-body",
        md: "h-11 px-4 text-dense",
        sm: "h-9 px-3 text-dense",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** While true the button keeps its width, shows `loadingLabel` (the verb in progress) and ignores clicks. */
  loading?: boolean;
  loadingLabel?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, loadingLabel, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading && <Loader aria-hidden className="size-4 shrink-0" />}
      <span>{loading && loadingLabel ? loadingLabel : children}</span>
    </button>
  );
});

export interface LinkButtonProps
  extends Omit<React.ComponentProps<typeof Link>, "className">,
    VariantProps<typeof buttonVariants> {
  className?: string;
  /** `inline` renders a plain text link; otherwise the link looks like a button. */
  appearance?: "inline" | "button";
}

/** Links navigate; buttons act. A link is never styled as a chip. */
export function LinkButton({ className, variant, size, appearance = "button", ...props }: LinkButtonProps) {
  return (
    <Link
      className={cn(
        appearance === "inline"
          ? "text-indigo underline underline-offset-2 hover:text-indigo-hover"
          : buttonVariants({ variant, size }),
        className,
      )}
      {...props}
    />
  );
}
