"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePageLocale } from "../../app/usePageLocale";
import { ApiError } from "../../api/client";
import { formatWaitingAge, t } from "../../i18n/format";
import { useReferrals } from "../../api/queries/hooks";
import type { Referral } from "../../api/queries/types";
import { useApi } from "../../api/queries/provider";
import { PERMISSIONS, can, hasRole } from "../../auth/access";
import { useMe } from "../../auth/me";
import { FINISHED_REFERRAL, referralTone } from "../../features/clinical/referralDisplay";
import { unifiedOfflineStore } from "../../offline/store";
import type { DecryptedUnifiedItem, OfflineStandardReferralPayload } from "../../offline/unifiedQueue";
import { StatusBadge } from "../StatusBadge/StatusBadge";
import { PartialReferralIntakePanel } from "./PartialReferralIntakePanel";
import { QueryBoundary } from "../QueryBoundary";
import { Button, buttonVariants } from "../ui/button";
import { Field, Input } from "../ui/field";
import { EmptyState } from "../ui/states";
import { FilterChip, Tabs, TabsList, TabsTrigger } from "../ui/selection";
import { ListRow, PageHeader } from "../ui/surfaces";
import { Table, TableCell, TableHead, TableHeaderCell, TableRow } from "../ui/table";

type Direction = "incoming" | "outgoing";
type StateFilter = "open" | "finished" | "all";

function Rows({ items, direction, locale }: { items: Referral[]; direction: Direction; locale: "bn" | "en" }) {
  const other = (r: Referral) => (direction === "incoming" ? r.sender_facility_name : r.receiver_facility_name);
  const age = (r: Referral) => formatWaitingAge(r.sent_at ?? r.created_at, locale);
  const urgency = (r: Referral) => t(locale, `queue.urgency.${r.urgency}`);
  return (
    <>
      <div className="hidden lg:block">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t(locale, "referrals.patient")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "referrals.facility")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "referrals.urgency")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "referrals.state")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "referrals.waiting")}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <tbody>
            {items.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/${locale}/referrals/${r.id}`} className="font-semibold text-indigo underline underline-offset-2">{r.patient_name}</Link>
                  <div className="font-mono text-caption text-ink-muted">
                    {[r.patient_system_id, r.reference_code].filter(Boolean).join(" · ")}
                  </div>
                </TableCell>
                <TableCell>{other(r)}</TableCell>
                <TableCell>{urgency(r)}</TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge entity="referral" state={r.state} tone={referralTone(r.state)} locale={locale} />
                    {r.is_partial && (
                      <span className="rounded-control border border-ochre bg-ochre-wash px-1.5 py-0.5 text-caption font-semibold text-ochre">
                        {t(locale, "receiving.partialBadge")}
                      </span>
                    )}
                    {!r.is_partial && r.reconciled_at && (
                      <span className="rounded-control border border-indigo bg-indigo-wash px-1.5 py-0.5 text-caption font-medium text-ink">
                        {t(locale, "receiving.reconciledBadge")}
                      </span>
                    )}
                    <span className="text-caption text-ink-muted">{t(locale, "chw.myReferrals.syncSubmitted")}</span>
                  </div>
                </TableCell>
                <TableCell numeric>{age(r)}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </div>
      <ul className="m-0 p-0 lg:hidden">
        {items.map((r) => (
          <ListRow
            key={r.id}
            href={`/${locale}/referrals/${r.id}`}
            title={r.patient_name}
            meta={`${other(r)}, ${urgency(r)}, ${age(r)}`}
            trailing={<StatusBadge entity="referral" state={r.state} tone={referralTone(r.state)} locale={locale} />}
          />
        ))}
      </ul>
    </>
  );
}

/** Lookup by the code printed on a transfer slip or QR token (`GET /referrals/by-reference/{code}`, receiving facility only). */
function SlipLookup({
  locale,
  onOfferPartial,
}: {
  locale: "bn" | "en";
  onOfferPartial?: (code: string) => void;
}) {
  const api = useApi();
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Referral | null>(null);
  const [none, setNone] = useState(false);
  const [failed, setFailed] = useState(false);
  async function find(e: React.FormEvent) {
    e.preventDefault();
    setFound(null);
    setNone(false);
    setFailed(false);
    if (!code.trim()) return;
    try {
      setFound((await api.get<Referral>(`/referrals/by-reference/${encodeURIComponent(code.trim())}`)).data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNone(true);
      else setFailed(true);
    }
  }
  return (
    <form onSubmit={find} className="flex flex-wrap items-end gap-2">
      <Field label={t(locale, "referrals.lookup")} help={t(locale, "referrals.lookupHelp")} locale={locale}>{(p) => <Input {...p} dense value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
      <Button type="submit" variant="secondary">{t(locale, "referrals.lookupGo")}</Button>
      {found && <Link href={`/${locale}/referrals/${found.id}`} className="text-dense text-indigo underline underline-offset-2">{found.patient_name}, {found.reference_code}</Link>}
      {failed && <p role="alert" className="m-0 w-full text-dense text-ink-muted">{t(locale, "error.generic")}</p>}
      {none && (
        <div role="status" className="flex w-full flex-wrap items-center gap-2 text-dense text-ink-muted">
          <span>{t(locale, "referrals.lookupNone")}</span>
          {onOfferPartial && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onOfferPartial(code.trim())}
            >
              {t(locale, "receiving.acceptPartial")}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

/** `/referrals`, `/referrals/incoming`, `/referrals/outgoing`: all referrals for the active facility (APPLICATION_DESIGN §5.3 + Phase 3D CHW My Referrals + Receiving Partial Intake). */
export function ReferralsIndex({ initial }: { initial: Direction }) {
  const locale = usePageLocale(undefined, "en");
  const router = useRouter();
  const { me } = useMe();
  const clinician = hasRole(me, "clinician");
  const canCreateOutgoing = clinician || can(me, PERMISSIONS.referralCreate);
  const canAcceptPartial = clinician || can(me, PERMISSIONS.referralAcknowledge);
  const [direction, setDirection] = useState<Direction>(initial);
  const [filter, setFilter] = useState<StateFilter>("open");
  const [partialOpen, setPartialOpen] = useState(false);
  const [partialInitialCode, setPartialInitialCode] = useState("");
  const [offlineRefs, setOfflineRefs] = useState<DecryptedUnifiedItem<OfflineStandardReferralPayload>[]>([]);
  const query = useReferrals(direction);
  const L = (k: string) => t(locale, `referrals.${k}`);
  const showOutgoing = canCreateOutgoing;

  useEffect(() => {
    if (!me?.id) return;
    let active = true;
    const load = () => {
      unifiedOfflineStore.listItemsForUser(me.id).then((items) => {
        if (!active) return;
        setOfflineRefs(
          items.filter(
            (i): i is DecryptedUnifiedItem<OfflineStandardReferralPayload> =>
              i.kind === "standard_referral"
          )
        );
      });
    };
    load();
    const unsub = unifiedOfflineStore.subscribe(load);
    return () => {
      active = false;
      unsub();
    };
  }, [me?.id]);

  function syncLabel(state: string): string {
    if (state === "FAILED" || state === "AUTH_REQUIRED") return t(locale, "chw.myReferrals.syncFailed");
    if (state === "PENDING_SYNC" || state === "SYNCING") return t(locale, "chw.myReferrals.syncPending");
    return t(locale, "chw.myReferrals.syncSavedLocal");
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={L("title")}
        actions={
          direction === "outgoing" && canCreateOutgoing ? (
            <Link href={`/${locale}/referrals/new`} className={buttonVariants()}>{L("new")}</Link>
          ) : direction === "incoming" && canAcceptPartial ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPartialInitialCode("");
                setPartialOpen((v) => !v);
              }}
            >
              {partialOpen ? t(locale, "receiving.closePartial") : t(locale, "receiving.acceptPartial")}
            </Button>
          ) : undefined
        }
      />
      <Tabs value={direction} onValueChange={(v) => setDirection(v as Direction)}>
        <TabsList>
          <TabsTrigger value="incoming">{L("incoming")}</TabsTrigger>
          {showOutgoing && <TabsTrigger value="outgoing">{L("outgoing")}</TabsTrigger>}
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap gap-2" role="group" aria-label={L("state")}>
        {(["open", "finished", "all"] as const).map((f) => <FilterChip key={f} pressed={filter === f} onClick={() => setFilter(f)}>{L(f)}</FilterChip>)}
      </div>
      {direction === "incoming" && (
        <SlipLookup
          locale={locale}
          onOfferPartial={
            canAcceptPartial
              ? (c) => {
                  setPartialInitialCode(c);
                  setPartialOpen(true);
                }
              : undefined
          }
        />
      )}
      {direction === "incoming" && partialOpen && canAcceptPartial && (
        <PartialReferralIntakePanel
          key={partialInitialCode}
          initialCode={partialInitialCode}
          locale={locale}
          onAccepted={(ref) => {
            setPartialOpen(false);
            router.push(`/${locale}/referrals/${ref.id}`);
          }}
          onCancel={() => setPartialOpen(false)}
        />
      )}
      {direction === "outgoing" && offlineRefs.length > 0 && (
        <section
          aria-label={t(locale, "chw.myReferrals.offlineHeading")}
          data-testid="chw-offline-referrals-list"
          className="rounded-panel border border-ochre bg-ochre-wash p-4"
        >
          <h2 className="m-0 text-dense font-semibold text-ochre">
            {t(locale, "chw.myReferrals.offlineHeading")}
          </h2>
          <p className="m-0 mt-1 text-caption text-ink-muted">
            {t(locale, "chw.myReferrals.offlineSubtext")}
          </p>
          <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
            {offlineRefs.map((item) => (
              <li
                key={item.queueId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-surface px-3 py-2"
              >
                <div className="flex flex-col">
                  <span className="font-mono text-dense font-semibold text-ink">
                    {item.provisionalCode ?? item.queueId}
                  </span>
                  <span className="font-mono text-caption text-ink-muted">
                    {item.payload?.patient_system_id ?? item.payload?.patient_id ?? ""}
                  </span>
                </div>
                <span className="rounded-control border border-ochre bg-ochre-wash px-2 py-0.5 text-caption font-semibold text-ochre">
                  {syncLabel(item.syncState)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <QueryBoundary query={query} locale={locale} loadingLabel={L("loading")} errorMessage={L("error")}>
        {(data) => {
          const items = data.results.filter((r) => filter === "all" || (filter === "finished") === FINISHED_REFERRAL.includes(r.state));
          return items.length === 0 ? <EmptyState message={L("empty")} /> : <Rows items={items} direction={direction} locale={locale} />;
        }}
      </QueryBoundary>
    </div>
  );
}
