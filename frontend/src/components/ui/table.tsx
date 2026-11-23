import React from "react";
import { cn } from "../../lib/cn";

/** Admin data. Sticky header on `sunken`, 44px rows, right-aligned tabular numbers (`numeric` cells). */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-panel border border-line bg-surface">
      <table className={cn("w-full border-collapse text-dense", className)} {...props} />
    </div>
  );
}
export function TableHead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("sticky top-0 bg-sunken text-start text-ink-muted", className)} {...props} />;
}
export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("h-11 border-b border-line last:border-b-0", className)} {...props} />;
}
export function TableHeaderCell({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn("px-3 text-start font-semibold", className)} {...props} />;
}
export function TableCell({ className, numeric, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <td className={cn("px-3", numeric && "text-end tabular-nums", className)} {...props} />;
}

/** Clinical and admin detail pages only, two levels at most. */
export function Breadcrumb({ items, label }: { items: { label: string; href?: string }[]; label: string }) {
  return (
    <nav aria-label={label}>
      <ol className="m-0 flex list-none items-center gap-2 p-0 text-dense text-ink-muted">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2" aria-current={i === items.length - 1 ? "page" : undefined}>
            {i > 0 && <span aria-hidden>/</span>}
            {item.href && i < items.length - 1 ? (
              <a href={item.href} className="text-indigo underline underline-offset-2">
                {item.label}
              </a>
            ) : (
              <span className="text-ink">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
