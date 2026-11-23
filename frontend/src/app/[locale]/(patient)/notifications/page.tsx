"use client";

import React from "react";
import { usePageLocale } from "../../../usePageLocale";
import { formatDhakaDateTime, formatTimeAgo, t } from "../../../../i18n/format";
import { asList, useNotifications, useMarkNotificationRead } from "../../../../api/queries/hooks";
import { PageHeader } from "../../../../components/ui/surfaces";
import { EmptyState, ErrorState, Skeleton } from "../../../../components/ui/states";
import { Button } from "../../../../components/ui/button";
import { cn } from "../../../../lib/cn";

export default function NotificationsPage() {
  const locale = usePageLocale(undefined, "bn");
  const { data, isLoading, isError, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();
  const notifications = asList(data);

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        serif
        title={t(locale, "patientNotifications.title")}
        context={t(locale, "patientNotifications.context")}
      />

      {isLoading && <Skeleton label={t(locale, "patientNotifications.loading")} />}
      {isError && (
        <ErrorState
          message={t(locale, "patientNotifications.error")}
          locale={locale}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && notifications.length === 0 && (
        <EmptyState message={t(locale, "patientNotifications.empty")} />
      )}

      {!isLoading && !isError && notifications.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {notifications.map((item) => {
            const isRead = item.state === "READ" || Boolean(item.read_at);
            const timeAgo = formatTimeAgo(item.created_at, locale);
            const dateStr = formatDhakaDateTime(item.created_at, locale);

            return (
              <li
                key={item.id}
                className={cn(
                  "flex flex-col gap-2 rounded-panel border p-4 transition-colors",
                  isRead ? "border-line bg-surface text-ink-muted" : "border-indigo bg-indigo-wash/20 text-ink"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        isRead ? "bg-line-strong" : "bg-indigo"
                      )}
                      aria-hidden="true"
                    />
                    <h3 className="m-0 text-dense font-semibold">{item.title}</h3>
                  </div>
                  <div className="text-caption text-ink-muted">
                    {dateStr} ({timeAgo})
                  </div>
                </div>

                <p className="m-0 text-dense text-ink">{item.body}</p>

                {!isRead && (
                  <div className="pt-1">
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => markRead.mutate(item.id)}
                    >
                      {t(locale, "patientNotifications.markRead")}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

