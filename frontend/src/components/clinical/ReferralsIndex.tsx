"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePageLocale } from "../../app/usePageLocale";
import { ApiError } from "../../api/client";
import { formatWaitingAge, t } from "../../i18n/format";
import { useReferrals } from "../../api/queries/hooks";
import type { Referral } from "../../api/queries/types";
import { useApi } from "../../api/queries/provider";
import { hasRole } from "../../auth/access";
import { useMe } from "../../auth/me";
import { FINISHED_REFERRAL, referralTone } from "../../features/clinical/referralDisplay";
import { StatusBadge } from "../StatusBadge/StatusBadge";
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
                <TableCell><Link href={`/${locale}/referrals/${r.id}`} className="font-semibold text-indigo underline underline-offset-2">{r.patient_name}</Link></TableCell>
                <TableCell>{other(r)}</TableCell>
                <TableCell>{urgency(r)}</TableCell>
                <TableCell><StatusBadge entity="referral" state={r.state} tone={referralTone(r.state)} locale={locale} /></TableCell>
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

/** Lookup by the code printed on an emergency transfer slip (`GET /referrals/by-reference/{code}`, receiving facility only). */
function SlipLookup({ locale }: { locale: "bn" | "en" }) {
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
      {none && <p role="status" className="m-0 w-full text-dense text-ink-muted">{t(locale, "referrals.lookupNone")}</p>}
    </form>
  );
}

/** `/referrals`, `/referrals/incoming`, `/referrals/outgoing`: all referrals for the active facility (APPLICATION_DESIGN §5.3). */
export function ReferralsIndex({ initial }: { initial: Direction }) {
  const locale = usePageLocale(undefined, "en");
  const { me } = useMe();
  const clinician = hasRole(me, "clinician");
  const [direction, setDirection] = useState<Direction>(initial);
  const [filter, setFilter] = useState<StateFilter>("open");
  const query = useReferrals(direction);
  const L = (k: string) => t(locale, `referrals.${k}`);
  const showOutgoing = clinician;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={L("title")}
        actions={direction === "outgoing" && clinician ? <Link href={`/${locale}/referrals/new`} className={buttonVariants()}>{L("new")}</Link> : undefined}
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
      {direction === "incoming" && <SlipLookup locale={locale} />}
      <QueryBoundary query={query} locale={locale} loadingLabel={L("loading")} errorMessage={L("error")}>
        {(data) => {
          const items = data.results.filter((r) => filter === "all" || (filter === "finished") === FINISHED_REFERRAL.includes(r.state));
          return items.length === 0 ? <EmptyState message={L("empty")} /> : <Rows items={items} direction={direction} locale={locale} />;
        }}
      </QueryBoundary>
    </div>
  );
}
