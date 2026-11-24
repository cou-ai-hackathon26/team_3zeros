import { EmergencyQueueStore } from "./queue";
import { UnifiedOfflineQueueStore } from "./unifiedQueue";

/** The one encrypted emergency queue for this browser (FRONTEND §9). Shared so pages and tests see the same store. */
export const emergencyStore = new EmergencyQueueStore();

/** Phase 3C unified encrypted offline queue for patients, standard referrals, emergency referrals, and referral actions. */
export const unifiedOfflineStore = new UnifiedOfflineQueueStore();

