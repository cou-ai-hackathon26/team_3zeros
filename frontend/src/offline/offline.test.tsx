import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmergencyQueueStore } from "./queue";
import { EmergencySlip } from "./EmergencySlip";

describe("FRONTEND §9 Offline Emergency Queue & Slip", () => {
  it("encrypts payload at rest with AES-GCM, syncs idempotently, and clears local copy on 201", async () => {
    const store = new EmergencyQueueStore({ dbName: "test-emergency-db-1" });
    const item = await store.enqueue({
      facilityId: "fac-uuid-1",
      facilityShortCode: "UHC12",
      payload: {
        unverified_description: "Adult male ~50y unconscious",
        reason: "Suspected stroke",
        urgency: "emergency",
        vitals: { recorded_at: "2026-11-23T01:00:00Z", items: [{ code: "BP", value: "190/110", unit: "mmHg" }] },
        treatment_given: "IV line established",
      },
    });
    expect(item.state).toBe("QUEUED_LOCAL");
    expect(item.provisionalCode).toMatch(/^UHC12-\d{4}-\d{4}$/);

    const rawRecord = await store.inspectRawRecord(item.idempotencyKey);
    expect(JSON.stringify(rawRecord.ciphertext)).not.toContain("Suspected stroke");

    // A second store instance pointing at the same IndexedDB must reuse the persisted CryptoKey across reloads
    const reloadedStore = new EmergencyQueueStore({ dbName: "test-emergency-db-1" });
    const reloadedItems = await reloadedStore.listItems();
    expect(reloadedItems).toHaveLength(1);
    expect(reloadedItems[0].payload.reason).toBe("Suspected stroke");

    await reloadedStore.syncAll(async () => ({
      status: 201,
      body: { id: "ref-99", reference_code: "REF-2026-0099", state: "SENT" },
    }));
    const afterSync = await store.listItems();
    expect(afterSync).toHaveLength(0);
  });

  it("transitions item to CONFLICT on 409 idempotency_conflict and preserves both versions (Review Focus #5)", async () => {
    const store = new EmergencyQueueStore({ dbName: "test-emergency-db-2" });
    await store.enqueue({
      facilityId: "fac-uuid-1",
      facilityShortCode: "UHC12",
      payload: {
        unverified_description: "Patient A",
        reason: "Acute abdomen",
        urgency: "emergency",
        vitals: { recorded_at: "2026-11-23T01:00:00Z", items: [] },
        treatment_given: "Analgesia",
      },
    });

    await store.syncAll(async () => ({
      status: 409,
      body: {
        error: { code: "idempotency_conflict", message: "Conflict" },
        stored_version: { reference_code: "REF-EXISTING", reason: "Different server reason" },
      },
    }));

    const items = await store.listItems();
    expect(items[0].state).toBe("CONFLICT");
    expect(items[0].serverConflictVersion?.reason).toBe("Different server reason");
  });

  it("flags items older than 72 hours as requiring persistent device warning banner", async () => {
    const store = new EmergencyQueueStore({ dbName: "test-emergency-db-3" });
    const fourDaysAgo = new Date(Date.now() - 80 * 3600 * 1000).toISOString();
    await store.enqueue({
      facilityId: "fac-uuid-1",
      facilityShortCode: "UHC12",
      createdAtDevice: fourDaysAgo,
      payload: { unverified_description: "P", reason: "R", urgency: "urgent", vitals: { recorded_at: fourDaysAgo, items: [] }, treatment_given: "T" },
    });
    expect(await store.hasStaleItemsOver72Hours()).toBe(true);
  });

  it("renders black-only A5/A6 EmergencySlip with provisional or server reference code", () => {
    render(
      <EmergencySlip
        referenceCode="UHC12-0045-1123"
        isProvisional={true}
        identityText="Karim Uddin, 54y"
        reason="Post-partum hemorrhage"
        urgency="emergency"
        vitals={[{ code: "BP", value: "85/50", unit: "mmHg" }]}
        vitalsRecordedAt="2026-11-23T01:15:00Z"
        treatmentGiven="Oxytocin + IV Normal Saline"
        sendingFacility="Mirzapur Upazila Health Complex"
        receivingFacility="Tangail District Hospital"
        createdAt="2026-11-23T01:20:00Z"
        locale="en"
      />
    );
    expect(screen.getByText("UHC12-0045-1123")).toBeTruthy();
    expect(screen.getByText(/Provisional offline code/i)).toBeTruthy();
  });
});
