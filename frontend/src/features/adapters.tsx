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
  contact: string;
  facility_id?: string;
  chamber_name?: string;
  chamber_name_bn?: string;
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

export const defaultAccessRequestAdapter: AccessRequestAdapter = {
  submit: async (req: AccessRequest) => {
    const res = await fetch("/api/v1/access-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      let errBody: unknown = null;
      try { errBody = await res.json(); } catch { /* ignore */ }
      const errObj = (errBody && typeof errBody === "object" && "error" in errBody) ? (errBody as { error: Record<string, unknown> }).error : null;
      throw new ApiError({
        status: res.status,
        code: typeof errObj?.code === "string" ? errObj.code : "generic",
        message: typeof errObj?.message === "string" ? errObj.message : `Failed to submit access request (${res.status})`,
        fieldErrors: (errObj?.field_errors && typeof errObj.field_errors === "object") ? (errObj.field_errors as Record<string, string[]>) : {},
      });
    }
    return (await res.json()) as { reference?: string };
  },
};

const unavailable = (): Promise<never> =>
  Promise.reject(new ApiError({ status: 501, code: "provider_unavailable", message: "No backend contract for this flow yet." }));

export const unavailableAdapters: Adapters = {
  passwordReset: { request: unavailable, complete: unavailable },
  patientProfile: { submit: unavailable },
  accessRequest: defaultAccessRequestAdapter,
  emailVerification: { confirm: unavailable },
};

const AdaptersContext = createContext<Adapters>(unavailableAdapters);

export function AdaptersProvider({ adapters, children }: { adapters: Partial<Adapters>; children: React.ReactNode }) {
  return <AdaptersContext.Provider value={{ ...unavailableAdapters, ...adapters }}>{children}</AdaptersContext.Provider>;
}

export const useAdapters = () => useContext(AdaptersContext);
