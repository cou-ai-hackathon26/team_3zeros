import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const nav = { pathname: "/en/patients/new", params: {} as Record<string, string>, search: "" };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => nav.pathname,
  useParams: () => ({ locale: "en", ...nav.params }),
}));

import { createApiClient } from "../../../api/client";
import { AppProviders, makeQueryClient } from "../../../api/queries/provider";
import { visibleNav } from "../../../auth/nav";
import type { UserMe } from "../../../auth/types";
import { UnifiedOfflineQueueStore, type UnifiedTransportFn } from "../../../offline/unifiedQueue";
import { unifiedOfflineStore } from "../../../offline/store";
import { RegisterPatientForm } from "../RegisterPatientForm";
import { AssistedConsentPanel } from "../AssistedConsentPanel";
import { ReferralSlip } from "../ReferralSlip";
import { buildReferralQrToken } from "../QrCodeSvg";
import NewReferralPage from "../../../app/[locale]/(clinician)/referrals/new/page";
import { ReferralsIndex } from "../../clinical/ReferralsIndex";

let dbSeq = 0;
function freshDb(label: string): string {
  dbSeq += 1;
  return `phase3d-${label}-${dbSeq}-${Date.now()}`;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const CHW_ME: UserMe = {
  id: "chw-3d-1",
  email: null,
  phone: null,
  display_name: "CHW Nasrin",
  preferred_language: "en",
  roles: ["facility_staff"],
  permissions: ["referral.create", "consent.record_assisted"],
  active_facility: { id: "fac-uhc-1", name: "Mirzapur UHC" },
  is_platform_admin: false,
};

function mountWithRoutes(
  ui: React.ReactElement,
  routes: Record<string, (req: Request) => Response | Promise<Response>>
) {
  const calls: Array<{ method: string; path: string; body: string; headers: Headers }> = [];
  const fetchImpl = async (req: Request) => {
    const u = new URL(req.url);
    const path = u.pathname.replace("/api/v1", "");
    const key = `${req.method} ${path}${u.search}`;
    calls.push({ method: req.method, path, body: await req.clone().text(), headers: new Headers(req.headers) });
    const hit = Object.entries(routes).find(
      ([k]) => key === k || key.startsWith(k + "?") || key.startsWith(k + "&") || `${req.method} ${path}` === k
    );
    return hit ? hit[1](req) : json({ error: { code: "not_found", message: "not_found" } }, 404);
  };
  const client = createApiClient({
    baseUrl: "http://localhost/api/v1",
    getCsrfToken: () => "csrf-3d",
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  const view = render(
    <AppProviders client={client} queryClient={makeQueryClient()}>
      {ui}
    </AppProviders>
  );
  return { ...view, calls };
}

describe("Phase 3D — CHW Patient Registration, Assisted Consent, Standard Referral & Slip", () => {
  beforeEach(() => {
    nav.pathname = "/en/patients/new";
    nav.search = "";
    vi.restoreAllMocks();
  });

  // ── Part 1: CHW Navigation ─────────────────────────────────────────────────
  describe("CHW Navigation & Permissions", () => {
    it("exposes patients and referrals to CHW with referral.create without opening them to unprivileged staff", () => {
      const chwIds = visibleNav(CHW_ME, "clinical").map((i) => i.id);
      expect(chwIds).toEqual(["queue", "patients", "referrals"]);

      const plainStaff: UserMe = { ...CHW_ME, permissions: [] };
      expect(visibleNav(plainStaff, "clinical").map((i) => i.id)).toEqual(["queue"]);
    });
  });

  // ── Part 2: Phone-less Patient Registration ────────────────────────────────
  describe("Phone-less Patient Registration", () => {
    it("registers a phone-less patient online with optional NID and displays server MWP-* system ID", async () => {
      const store = new UnifiedOfflineQueueStore({ dbName: freshDb("reg-online") });
      const { calls } = mountWithRoutes(<RegisterPatientForm store={store} />, {
        "GET /auth/me": () => json(CHW_ME),
        "POST /patients/": () =>
          json(
            {
              id: "pat-srv-1",
              system_id: "MWP-7K9M2N4P",
              has_account: false,
              given_name: "Rahima",
              family_name: "Begum",
              sex: "female",
              phone: null,
              identifiers: [],
              version: 1,
            },
            201
          ),
      });

      fireEvent.change(screen.getByLabelText(/patient name/i), { target: { value: "Rahima" } });
      fireEvent.change(screen.getByLabelText(/additional id type/i), { target: { value: "nid" } });
      fireEvent.change(screen.getByLabelText(/id number/i), { target: { value: "1990123456789" } });

      // Rapid double submit must only fire one POST
      const btn = screen.getByRole("button", { name: /register patient/i });
      fireEvent.click(btn);
      fireEvent.click(btn);

      await waitFor(() => {
        expect(screen.getByTestId("patient-system-id").textContent).toBe("MWP-7K9M2N4P");
      });

      const postCalls = calls.filter((c) => c.method === "POST" && c.path === "/patients/");
      expect(postCalls).toHaveLength(1);
      const sentBody = JSON.parse(postCalls[0].body);
      expect(sentBody.phone).toBeNull();
      expect(sentBody.identifiers).toEqual([{ system: "nid", value: "1990123456789", verified: false }]);
    });

    it("queues patient_create encrypted offline, shows temporary local-pat-* ref (never fake MWP), and gets MWP on sync", async () => {
      const store = new UnifiedOfflineQueueStore({ dbName: freshDb("reg-offline") });
      const origOnLine = navigator.onLine;
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

      try {
        mountWithRoutes(<RegisterPatientForm store={store} />, {
          "GET /auth/me": () => json(CHW_ME),
        });

        await waitFor(() => expect(screen.getByLabelText(/patient name/i)).toBeTruthy());
        fireEvent.change(screen.getByLabelText(/patient name/i), { target: { value: "Salma" } });
        fireEvent.click(screen.getByRole("button", { name: /register patient/i }));

        await waitFor(() => {
          expect(screen.getByTestId("patient-registered-offline")).toBeTruthy();
        });

        const tempRef = screen.getByTestId("patient-temp-ref").textContent ?? "";
        expect(tempRef).toMatch(/^local-pat-/);
        expect(tempRef).not.toContain("MWP-");

        // Sync after reconnect
        await store.syncForUser(CHW_ME.id, async () => ({
          status: 201,
          body: { id: "pat-synced-1", system_id: "MWP-3A4B5C6D" },
        }));
        const receipts = await store.listSyncedReceiptsForUser(CHW_ME.id);
        expect(receipts[0].serverSystemId).toBe("MWP-3A4B5C6D");
      } finally {
        Object.defineProperty(navigator, "onLine", { value: origOnLine, configurable: true });
      }
    });
  });

  // ── Part 3: Assisted In-Person Consent ─────────────────────────────────────
  describe("Assisted In-Person Consent", () => {
    it("validates in-person confirmation and witness name, and submits assisted_verbal and assisted_paper", async () => {
      const onRecorded = vi.fn();
      const { calls } = mountWithRoutes(
        <AssistedConsentPanel
          consentRequestId="cr-uuid-1"
          patientHasAccount={false}
          locale="en"
          onRecorded={onRecorded}
        />,
        {
          "POST /consents/requests/cr-uuid-1/record-assisted": () =>
            json({ state: "READY_FOR_SENDER_APPROVAL" }, 200),
        }
      );

      // Clinical/legal review notice & clinician-approval notice must be visible
      expect(screen.getByText(/clinical\/legal review required/i)).toBeTruthy();
      expect(screen.getByText(/does not replace clinician approval/i)).toBeTruthy();

      // Missing in-person confirmation -> blocked
      fireEvent.click(screen.getByRole("button", { name: /record assisted consent/i }));
      expect(screen.getByText(/confirm that the patient gave consent in person/i)).toBeTruthy();

      // Check confirmation but missing witness -> blocked
      fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.click(screen.getByRole("button", { name: /record assisted consent/i }));
      expect(screen.getByText(/witness name is required/i)).toBeTruthy();

      // Select assisted_paper, fill witness, submit
      fireEvent.click(screen.getByRole("radio", { name: /signed paper consent/i }));
      fireEvent.change(screen.getByLabelText(/witness full name/i), { target: { value: "Karim Mia" } });
      fireEvent.click(screen.getByRole("button", { name: /record assisted consent/i }));

      await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
      const post = calls.find((c) => c.path.endsWith("/record-assisted"))!;
      expect(JSON.parse(post.body)).toMatchObject({
        method: "assisted_paper",
        patient_confirmed_in_person: true,
        witness_name: "Karim Mia",
      });
    });

    it("blocks assisted consent when patient has an active PatientAccount", () => {
      mountWithRoutes(
        <AssistedConsentPanel
          consentRequestId="cr-uuid-2"
          patientHasAccount={true}
          locale="en"
          onRecorded={vi.fn()}
        />,
        {}
      );
      expect(screen.getByText(/active Medi Waypoint account/i)).toBeTruthy();
      expect(screen.queryByRole("button", { name: /record assisted consent/i })).toBeNull();
    });
  });

  // ── Part 4 & 5: Standard Referral Offline Dependency & F-3 Safety Rule ─────
  describe("Standard Referral Offline Dependency & F-3 Uncertain-Outcome Safety", () => {
    it("queues standard_referral with dependsOnQueueId for offline-created patient and renders provisional slip", async () => {
      const pat = await unifiedOfflineStore.enqueueOfflinePatient({
        ownerUserId: CHW_ME.id,
        facilityId: "fac-uhc-1",
        payload: { given_name: "Fatema", sex: "female", phone: null },
      });

      nav.pathname = "/en/referrals/new";
      nav.search = `offlinePatientQueueId=${encodeURIComponent(pat.queueId)}&localPatientRef=${encodeURIComponent(pat.tempEntityRef!)}`;

      const { calls } = mountWithRoutes(<NewReferralPage />, {
        "GET /auth/me": () => json(CHW_ME),
        "GET /directory/facilities": () =>
          json({ results: [{ id: "fac-dh-1", name: "Tangail District Hospital", latest_capacity: null }], next_cursor: null }),
      });

      await waitFor(() => expect(screen.getByText(/Tangail District Hospital/i)).toBeTruthy());

      fireEvent.change(screen.getByRole("combobox", { name: /destination/i }), { target: { value: "fac-dh-1" } });
      fireEvent.change(screen.getByRole("textbox", { name: /reason/i }), { target: { value: "Severe anemia in pregnancy" } });
      fireEvent.click(screen.getByRole("button", { name: /create/i }));

      await waitFor(() => {
        expect(screen.getByTestId("referral-saved-offline")).toBeTruthy();
        expect(screen.getByTestId("standard-referral-slip")).toBeTruthy();
      });

      // Must NEVER have called POST /referrals/ while patient dependency is unresolved
      expect(calls.some((c) => c.method === "POST" && c.path === "/referrals/")).toBe(false);

      // Cleanup queued test items from shared singleton
      await unifiedOfflineStore.syncForUser(CHW_ME.id, async (item) => {
        if (item.kind === "patient_create") {
          return { status: 201, body: { id: "srv-pat-clean", system_id: "MWP-11112222" } };
        }
        return { status: 201, body: { id: "srv-ref-clean", reference_code: "REF-CLEAN-1" } };
      });
    });

    it("F-3 safety rule: reconciles uncertain failed item using original idempotencyKey before allowing key rotation", async () => {
      const store = new UnifiedOfflineQueueStore({ dbName: freshDb("f3-uncertain") });
      const item = await store.enqueueStandardReferral({
        ownerUserId: CHW_ME.id,
        facilityId: "fac-uhc-1",
        payload: {
          patient_id: "pat-srv-1",
          receiver_facility_id: "fac-dh-1",
          urgency: "urgent",
          reason: "Lost response test",
        },
      });

      // Simulate lost HTTP response: server committed, client saw network failure
      const serverAcceptedKeys = new Set<string>([item.idempotencyKey]);
      await store.syncForUser(CHW_ME.id, async () => {
        throw new TypeError("Response lost on wire");
      });

      const probedKeys: string[] = [];
      const transport: UnifiedTransportFn = async (it) => {
        probedKeys.push(it.idempotencyKey);
        if (serverAcceptedKeys.has(it.idempotencyKey)) {
          return { status: 200, body: { id: "srv-ref-accepted", reference_code: "REF-ACCEPTED-1" } };
        }
        return { status: 400, body: {}, errorCode: "validation_error" };
      };

      const outcome = await store.reconcileUncertainFailedItem(CHW_ME.id, item.queueId, transport);
      expect(outcome.outcome).toBe("already_accepted");
      expect(probedKeys).toEqual([item.idempotencyKey]); // Reused exact original key, zero duplicates
      expect(await store.listItemsForUser(CHW_ME.id)).toHaveLength(0);
    });
  });

  // ── Part 6: Standard Referral Slip & Zero-PII QR ───────────────────────────
  describe("Standard Referral Slip & Zero-PII QR", () => {
    it("encodes ONLY MW-REF:<code > in QR with zero PHI and distinguishes provisional vs confirmed", () => {
      expect(buildReferralQrToken("REF-2026-0042")).toBe("MW-REF:REF-2026-0042");

      const { rerender } = render(
        <ReferralSlip
          referenceCode="UHC01-1124-0007"
          isProvisional={true}
          patientSystemId={null}
          patientName="CONFIDENTIAL_PATIENT_NAME"
          sendingFacility="Mirzapur UHC"
          receivingFacility="Tangail DH"
          urgency="urgent"
          reason="CONFIDENTIAL_DIAGNOSIS"
          createdAt="2026-11-24T05:00:00Z"
          locale="en"
        />
      );

      const qr = screen.getByTestId("referral-qr-svg");
      const qrPayload = qr.getAttribute("data-qr-payload") ?? "";
      expect(qrPayload).toBe("MW-REF:UHC01-1124-0007");
      expect(qrPayload).not.toContain("CONFIDENTIAL_PATIENT_NAME");
      expect(qrPayload).not.toContain("CONFIDENTIAL_DIAGNOSIS");
      expect(screen.getByTestId("slip-reference-status").textContent).toMatch(/PROVISIONAL/i);
      expect(screen.getByText(/Pending sync \(local patient\)/i)).toBeTruthy();

      rerender(
        <ReferralSlip
          referenceCode="REF-2026-0042"
          isProvisional={false}
          patientSystemId="MWP-99887766"
          patientName="Rahima"
          sendingFacility="Mirzapur UHC"
          receivingFacility="Tangail DH"
          urgency="routine"
          reason="Follow-up"
          createdAt="2026-11-24T05:00:00Z"
          locale="en"
        />
      );

      expect(screen.getByTestId("referral-qr-svg").getAttribute("data-qr-payload")).toBe("MW-REF:REF-2026-0042");
      expect(screen.getByTestId("slip-reference-status").textContent).toMatch(/CONFIRMED SERVER REFERENCE/i);
      expect(screen.getByText("MWP-99887766")).toBeTruthy();
    });
  });

  // ── Part 7: CHW My Referrals ───────────────────────────────────────────────
  describe("CHW My Referrals List", () => {
    it("shows Outgoing tab, New referral CTA, server referrals with MWP IDs, and distinct local unsynchronized referrals", async () => {
      const queued = await unifiedOfflineStore.enqueueStandardReferral({
        ownerUserId: CHW_ME.id,
        facilityId: "fac-uhc-1",
        facilityShortCode: "UHC01",
        payload: {
          patient_id: "local-pat-xyz",
          receiver_facility_id: "fac-dh-1",
          urgency: "urgent",
          reason: "Pending local referral",
        },
      });

      nav.pathname = "/en/referrals/outgoing";
      mountWithRoutes(<ReferralsIndex initial="outgoing" />, {
        "GET /auth/me": () => json(CHW_ME),
        "GET /referrals/?direction=outgoing": () =>
          json({
            results: [
              {
                id: "ref-srv-1",
                reference_code: "REF-2026-0099",
                state: "ACKNOWLEDGED_BY_RECEIVER",
                urgency: "urgent",
                emergency_mode: false,
                reason: "Hypertension",
                patient_id: "pat-1",
                patient_name: "Rahima",
                patient_system_id: "MWP-12345678",
                sender_facility_id: "fac-uhc-1",
                sender_facility_name: "Mirzapur UHC",
                receiver_facility_id: "fac-dh-1",
                receiver_facility_name: "Tangail DH",
                summary: {},
                consent_state: "active",
                allowed_actions: [],
                version: 3,
                history: [],
                created_at: "2026-11-24T04:00:00Z",
                updated_at: "2026-11-24T04:10:00Z",
              },
            ],
            next_cursor: null,
          }),
      });

      await waitFor(() => {
        expect(screen.getByTestId("chw-offline-referrals-list")).toBeTruthy();
        expect(screen.getByText(queued.provisionalCode!)).toBeTruthy();
        expect(screen.getByText(/Saved locally/i)).toBeTruthy();
        expect(screen.getByText(/MWP-12345678/)).toBeTruthy();
        expect(screen.getByText(/Submitted to server/i)).toBeTruthy();
      });

      // Cleanup singleton
      await unifiedOfflineStore.syncForUser(CHW_ME.id, async () => ({
        status: 201,
        body: { id: "srv-clean-myref", reference_code: "REF-CLEAN-2" },
      }));
    });
  });
});
