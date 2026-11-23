import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

/** DESIGN_SYSTEM §6.5. Default container: surface, 1px line, panel radius, no shadow. */
export function Panel({
  className,
  title,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { title?: React.ReactNode }) {
  return (
    <section className={cn("rounded-panel border border-line bg-surface", className)} {...props}>
      {title && <h2 className="m-0 border-b border-line px-4 py-3 text-subheading font-semibold">{title}</h2>}
      <div className="p-4">{children}</div>
    </section>
  );
}

const tile = cva("block rounded-tile p-5 no-underline", {
  variants: {
    tone: {
      default: "border border-line bg-surface text-ink",
      brand: "bg-brand text-brand-foreground",
      wash: "bg-accent text-accent-foreground",
    },
  },
  defaultVariants: { tone: "default" },
});

/** Bento unit (only where DESIGN_SYSTEM §4.1 allows a bento layout). One destination makes the whole tile a link. */
export function Tile({
  className,
  tone,
  href,
  children,
}: VariantProps<typeof tile> & { className?: string; href?: string; children: React.ReactNode }) {
  const Tag = href ? "a" : "div";
  return (
    <Tag href={href} className={cn(tile({ tone }), href && "hover:bg-sunken", className)}>
      {children}
    </Tag>
  );
}

/** Like items in a list (doctors, appointments, reports, consents). */
export function ListRow({
  title,
  meta,
  trailing,
  href,
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body font-semibold text-ink">{title}</span>
        {meta && <span className="text-caption text-ink-muted">{meta}</span>}
      </span>
      {trailing && <span className="shrink-0 text-dense">{trailing}</span>}
    </>
  );
  const row = "flex min-h-14 items-center gap-3 border-b border-line px-1 py-3 no-underline text-ink";
  return (
    <li className={cn("m-0 list-none", className)}>
      {href ? (
        <a href={href} className={cn(row, "hover:bg-sunken")}>
          {body}
        </a>
      ) : (
        <div className={row}>{body}</div>
      )}
    </li>
  );
}

export function PageHeader({
  title,
  status,
  context,
  actions,
  serif,
}: {
  title: React.ReactNode;
  status?: React.ReactNode;
  context?: React.ReactNode;
  actions?: React.ReactNode;
  /** Serif titles only in public, auth and patient areas (DESIGN_SYSTEM §10.6). */
  serif?: boolean;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 pb-4">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={cn("m-0", serif ? "font-serif text-title" : "text-heading font-semibold")}>{title}</h1>
          {status}
        </div>
        {context && <p className="m-0 text-dense text-ink-muted">{context}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Label-value pairs: patient context, consent details, slip preview. */
export function DescriptionList({ items }: { items: { label: React.ReactNode; value: React.ReactNode }[] }) {
  return (
    <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-dense">
      {items.map((item, i) => (
        <React.Fragment key={i}>
          <dt className="text-ink-muted">{item.label}</dt>
          <dd className="m-0 text-ink">{item.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
