import { EmergencyQueueStore } from "./queue";

/** The one encrypted emergency queue for this browser (FRONTEND §9). Shared so pages and tests see the same store. */
export const emergencyStore = new EmergencyQueueStore();
