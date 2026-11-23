"use client";

import React, { createContext, useContext } from "react";
import { ApiError } from "../api/client";

/**
 * PROPOSED, NOT IN CONTRACT (AUTH_RBAC §6). Each flow has a typed adapter so screens can be built
 * and tested before the backend decides the endpoints (Q-14 to Q-17). No endpoint is named
 * here or added to MASTERPLAN §6.3. The default binding rejects every call, so a flag turned on
 * early shows an honest error rather than a fake success. Mocks are used in tests and Storybook only.
 */
export interface PasswordResetAdapter {
  request(identifier: string): Promise<void>;
  complete(token: string, newPassword: string): Promise<"done" | "expired">;
}

export interface PatientProfile {
  given_name: string;
  family_name?: string;
  name_bn?: string;
  birth_date?: string;
  estimated_age?: number;
  sex: "female" | "male" | "other";
  area?: string;
  preferred_language: "bn" | "en";
}

export interface PatientProfileAdapter {
  submit(profile: PatientProfile): Promise<{ duplicate: boolean }>;
}

export interface AccessRequest {
  name: string;
  bmdc_registration_number: string;
  facility_id: string;
  contact: string;
}

export interface AccessRequestAdapter {
  submit(request: AccessRequest): Promise<{ reference?: string }>;
}

export interface EmailVerificationAdapter {
  confirm(token: string): Promise<"success" | "expired" | "used">;
}

export interface Adapters {
  passwordReset: PasswordResetAdapter;
  patientProfile: PatientProfileAdapter;
  accessRequest: AccessRequestAdapter;
  emailVerification: EmailVerificationAdapter;
}

const unavailable = (): Promise<never> =>
  Promise.reject(new ApiError({ status: 501, code: "provider_unavailable", message: "No backend contract for this flow yet." }));

export const unavailableAdapters: Adapters = {
  passwordReset: { request: unavailable, complete: unavailable },
  patientProfile: { submit: unavailable },
  accessRequest: { submit: unavailable },
  emailVerification: { confirm: unavailable },
};

const AdaptersContext = createContext<Adapters>(unavailableAdapters);

export function AdaptersProvider({ adapters, children }: { adapters: Partial<Adapters>; children: React.ReactNode }) {
  return <AdaptersContext.Provider value={{ ...unavailableAdapters, ...adapters }}>{children}</AdaptersContext.Provider>;
}

export const useAdapters = () => useContext(AdaptersContext);
