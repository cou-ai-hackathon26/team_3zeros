"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, Loader, RefreshCw, TriangleAlert, WifiOff } from "lucide-react";
import { usePageLocale } from "../../app/usePageLocale";
import { useApi } from "../../api/queries/provider";
import { useMe } from "../../auth/me";
import { t } from "../../i18n/format";
import { cn } from "../../lib/cn";
import { unifiedOfflineStore } from "../../offline/store";
import { createUnifiedSyncTransport } from "../../offline/syncTransport";
import type {
  DecryptedUnifiedItem,
  SyncedReceipt,
  UnifiedOfflineQueueStore,
} from "../../offline/unifiedQueue";
import { Button, buttonVariants } from "../ui/button";

export interface OfflineSyncBarProps {
  /** Optional store override for isolated unit/integration tests. */
  store?: UnifiedOfflineQueueStore;
}

const SYNC_INTERVAL_MS = 15_000;

export function OfflineSyncBar({ store = unifiedOfflineStore }: OfflineSyncBarProps) {
  const locale = usePageLocale(undefined, "en");
  const api = useApi();
  const { me } = useMe();
  const userId = me?.id ?? null;

  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false
  );
  const [items, setItems] = useState<DecryptedUnifiedItem[]>([]);
  const [receipts, setReceipts] = useState<SyncedReceipt[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [confirmDiscardId, setConfirmDiscardId] = useState<string | null>(null);

  const transport = useMemo(() => createUnifiedSyncTransport(api), [api]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setReceipts([]);
      return;
    }
    const [pending, synced] = await Promise.all([
      store.listItemsForUser(userId),
      store.listSyncedReceiptsForUser(userId),
    ]);
    setItems(pending);
    setReceipts(synced);
  }, [store, userId]);

  const runSync = useCallback(
    async (forceRetry: boolean = false) => {
      if (!userId) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        await store.markPendingOffline(userId);
        return;
      }
      await store.syncForUser(userId, transport, { forceRetry });
      await refresh();
    },
    [refresh, store, transport, userId]
  );

  // Subscribe to store updates
  useEffect(() => {
    void refresh();
    return store.subscribe(() => {
      void refresh();
    });
  }, [refresh, store]);

  // Resume auth-paused items when user is authenticated and trigger initial sync
  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const resumed = await store.resumeAfterAuth(userId);
      if (!active) return;
      if (online) {
        if (resumed > 0) {
          await runSync(true);
        } else {
          await runSync(false);
        }
      } else {
        await store.markPendingOffline(userId);
      }
    })();
    return () => {
      active = false;
    };
  }, [online, runSync, store, userId]);

  // Browser online/offline + focus listeners
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => {
      setOnline(true);
      void runSync(false);
    };
    const handleOffline = () => {
      setOnline(false);
      if (userId) {
        void store.markPendingOffline(userId);
      }
    };
    const handleFocus = () => {
      if (typeof navigator === "undefined" || navigator.onLine !== false) {
        setOnline(true);
        void runSync(false);
      }
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
    };
  }, [runSync, store, userId]);

  // Periodic background retry while pending items exist
  useEffect(() => {
    if (!userId || !online || items.length === 0) return;
    const id = window.setInterval(() => {
      void runSync(false);
    }, SYNC_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [items.length, online, runSync, userId]);

  // Do not clutter the workspace when online with an empty queue and no recent receipts
  if (online && items.length === 0 && receipts.length === 0) {
    return null;
  }

  const syncingCount = items.filter((i) => i.syncState === "SYNCING").length;
  const authCount = items.filter((i) => i.syncState === "AUTH_REQUIRED").length;
  const failedCount = items.filter((i) => i.syncState === "FAILED").length;
  const pendingCount = items.filter(
    (i) => i.syncState === "SAVED_LOCAL" || i.syncState === "PENDING_SYNC"
  ).length;

  const hasAuthRequired = authCount > 0;
  const hasAlert = !online || hasAuthRequired || failedCount > 0;
  const isSyncing = syncingCount > 0;

  const toneClass = hasAlert
    ? "border-ochre bg-ochre-wash text-ink"
    : isSyncing || pendingCount > 0
      ? "border-indigo bg-indigo-wash text-ink"
      : "border-line bg-surface text-ink";

  const Icon = !online
    ? WifiOff
    : hasAuthRequired || failedCount > 0
      ? TriangleAlert
      : isSyncing
        ? Loader
        : Check;

  return (
    <section
      aria-label={t(locale, "offlineSync.queueTitle")}
      data-testid="offline-sync-bar"
      className={cn("border-b px-4 py-2 text-caption", toneClass)}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Icon
            aria-hidden
            className={cn(
              "size-4 shrink-0",
              hasAlert ? "text-ochre" : isSyncing || pendingCount > 0 ? "text-indigo" : "text-positive"
            )}
          />
          {!online && (
            <span className="font-semibold text-ochre">{t(locale, "offlineSync.offlineBanner")}</span>
          )}
          {hasAuthRequired && (
            <span className="font-semibold text-ochre">
              {t(locale, "offlineSync.authRequiredBanner")}
            </span>
          )}
          {isSyncing && (
            <span className="font-medium">
              {t(locale, "offlineSync.syncingSummary").replace("{n}", String(syncingCount))}
            </span>
          )}
          {pendingCount > 0 && (
            <span className="font-medium">
              {t(locale, "offlineSync.pendingSummary").replace("{n}", String(pendingCount))}
            </span>
          )}
          {failedCount > 0 && (
            <span className="font-semibold text-ochre">
              {t(locale, "offlineSync.failedSummary").replace("{n}", String(failedCount))}
            </span>
          )}
          {items.length === 0 && receipts.length > 0 && (
            <span className="font-medium text-positive">
              {t(locale, "offlineSync.syncedSummary").replace("{n}", String(receipts.length))}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasAuthRequired && (
            <Link
              href={`/${locale}/login`}
              className={buttonVariants({ size: "sm", variant: "secondary" })}
            >
              {t(locale, "offlineSync.signInToSync")}
            </Link>
          )}
          {online && items.length > 0 && !hasAuthRequired && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void runSync(true)}
              disabled={isSyncing}
            >
              <RefreshCw aria-hidden className="mr-1 size-3.5" />
              {t(locale, "offlineSync.retryNow")}
            </Button>
          )}
          {(items.length > 0 || receipts.length > 0) && (
            <Button
              size="sm"
              variant="quiet"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? t(locale, "offlineSync.hideQueue") : t(locale, "offlineSync.viewQueue")}
              {expanded ? (
                <ChevronUp aria-hidden className="ml-1 size-3.5" />
              ) : (
                <ChevronDown aria-hidden className="ml-1 size-3.5" />
              )}
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div
          data-testid="offline-sync-drawer"
          className="mx-auto mt-2 max-w-6xl rounded-control border border-line bg-surface p-3 text-ink"
        >
          {items.length === 0 ? (
            <p className="text-ink-muted">{t(locale, "offlineSync.emptyQueue")}</p>
          ) : (
            <ul className="m-0 list-none space-y-2 p-0">
              {items.map((item) => (
                <li
                  key={item.queueId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-sunken px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      {t(locale, `offlineSync.kind.${item.kind}`)}
                    </span>
                    {item.provisionalCode && (
                      <span className="font-mono text-ink-muted">{item.provisionalCode}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-control border px-2 py-0.5 font-medium",
                        item.syncState === "FAILED" || item.syncState === "AUTH_REQUIRED"
                          ? "border-ochre bg-ochre-wash text-ochre"
                          : "border-indigo bg-indigo-wash text-ink"
                      )}
                    >
                      {t(locale, `offlineSync.state.${item.syncState}`)}
                    </span>
                    {item.errorKind && (
                      <span className="text-ochre">
                        {t(locale, `offlineSync.error.${item.errorKind}`)}
                      </span>
                    )}
                    {item.syncState === "FAILED" && userId && (
                      confirmDiscardId === item.queueId ? (
                        <span className="inline-flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={async () => {
                              await store.discardFailedItem(userId, item.queueId, "user_confirmed_discard");
                              setConfirmDiscardId(null);
                              await refresh();
                            }}
                          >
                            {t(locale, "offlineSync.confirmDiscard")}
                          </Button>
                          <Button
                            size="sm"
                            variant="quiet"
                            onClick={() => setConfirmDiscardId(null)}
                          >
                            {t(locale, "offlineSync.cancelDiscard")}
                          </Button>
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="quiet"
                          onClick={() => setConfirmDiscardId(item.queueId)}
                        >
                          {t(locale, "offlineSync.discard")}
                        </Button>
                      )
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {receipts.length > 0 && (
            <div className="mt-3 border-t border-line pt-2">
              <p className="mb-1 font-semibold text-ink-muted">
                {t(locale, "offlineSync.recentSynced")}
              </p>
              <ul className="m-0 list-none space-y-1 p-0">
                {receipts.slice(0, 5).map((r) => (
                  <li
                    key={r.queueId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line px-3 py-1.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {t(locale, `offlineSync.kind.${r.kind}`)}
                      </span>
                      {(r.serverReferenceCode || r.serverSystemId || r.provisionalCode) && (
                        <span className="font-mono text-ink-muted">
                          {r.serverReferenceCode ?? r.serverSystemId ?? r.provisionalCode}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.reconciledPartial && (
                        <span className="rounded-control border border-indigo bg-indigo-wash px-2 py-0.5 text-ink">
                          {t(locale, "offlineSync.reconciledNote")}
                        </span>
                      )}
                      <span className="font-medium text-positive">
                        {t(locale, "offlineSync.state.SYNCED")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
