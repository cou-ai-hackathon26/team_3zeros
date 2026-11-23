"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import type { Locale } from "../i18n/config";
import { t } from "../i18n/format";
import { defaultApiClient } from "../api/client";

export interface ActiveFacilityInfo {
  id: string;
  name: string;
  name_bn?: string;
}

export interface UserMe {
  id: string;
  email: string | null;
  phone: string | null;
  display_name: string;
  preferred_language: string;
  roles: string[];
  active_facility: ActiveFacilityInfo | null;
  permissions: string[];
  is_platform_admin: boolean;
}

interface SessionContextValue {
  me: UserMe | null;
  setMe: (me: UserMe | null) => void;
  switchFacility: (facilityId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export interface SessionProviderProps {
  initialMe?: UserMe | null;
  onSwitchFacility?: (facilityId: string) => Promise<ActiveFacilityInfo>;
  onClearCache?: () => void;
  children: React.ReactNode;
}

export function SessionProvider({
  initialMe = null,
  onSwitchFacility,
  onClearCache,
  children,
}: SessionProviderProps) {
  const [me, setMe] = useState<UserMe | null>(initialMe);

  const switchFacility = useCallback(
    async (facilityId: string) => {
      if (onSwitchFacility) {
        const nextFacility = await onSwitchFacility(facilityId);
        onClearCache?.();
        setMe((prev) => (prev ? { ...prev, active_facility: nextFacility } : prev));
        return;
      }
      const { data } = await defaultApiClient.post<UserMe>("/auth/active-facility", {
        body: { facility_id: facilityId },
      });
      onClearCache?.();
      setMe(data);
    },
    [onSwitchFacility, onClearCache]
  );

  const signOut = useCallback(async () => {
    try {
      await defaultApiClient.post("/auth/logout");
    } finally {
      onClearCache?.();
      setMe(null);
    }
  }, [onClearCache]);

  return (
    <SessionContext.Provider value={{ me, setMe, switchFacility, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    return {
      me: null,
      setMe: () => {},
      switchFacility: async () => {},
      signOut: async () => {},
    };
  }
  return ctx;
}

export interface IdleTimeoutWarningProps {
  secondsRemaining: number;
  locale: Locale;
  onStaySignedIn: () => void;
  onSignOut: () => void;
}

/**
 * SECURITY §3.3 & FRONTEND §4:
 * Clinician sessions time out after 15 minutes idle, showing a visible countdown
 * warning at 13 minutes (120 seconds remaining) with "Stay signed in".
 */
export function IdleTimeoutWarning({
  secondsRemaining,
  locale,
  onStaySignedIn,
  onSignOut,
}: IdleTimeoutWarningProps) {
  return (
    <div
      role="alertdialog"
      aria-labelledby="idle-timeout-title"
      aria-describedby="idle-timeout-desc"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(22, 48, 42, 0.45)",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: "var(--color-paper)",
          color: "var(--color-ink)",
          border: "1px solid var(--color-line)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--elevation-float)",
          padding: "var(--space-24)",
          maxWidth: "420px",
          width: "100%",
        }}
      >
        <h2 id="idle-timeout-title" style={{ margin: "0 0 var(--space-12) 0", fontSize: "20px" }}>
          {locale === "bn" ? "সেশন শীঘ্রই শেষ হবে" : "Session timeout warning"}
        </h2>
        <p id="idle-timeout-desc" style={{ margin: "0 0 var(--space-16) 0", color: "var(--color-ink-muted)" }}>
          {locale === "bn"
            ? `নিরাপত্তার জন্য ${secondsRemaining} সেকেন্ড পর সাইন আউট হয়ে যাবে।`
            : `For patient privacy on shared computers, your session will sign out in ${secondsRemaining} seconds.`}
        </p>
        <div style={{ display: "flex", gap: "var(--space-12)", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onSignOut}
            style={{
              minHeight: "44px",
              padding: "0 var(--space-16)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink)",
              cursor: "pointer",
            }}
          >
            {t(locale, "clinician.signOut")}
          </button>
          <button
            type="button"
            onClick={onStaySignedIn}
            style={{
              minHeight: "44px",
              padding: "0 var(--space-16)",
              borderRadius: "var(--radius-sm)",
              border: "none",
              backgroundColor: "var(--color-forest)",
              color: "var(--color-paper)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t(locale, "clinician.staySignedIn")}
          </button>
        </div>
      </div>
    </div>
  );
}
