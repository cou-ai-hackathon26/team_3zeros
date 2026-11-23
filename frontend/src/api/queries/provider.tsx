"use client";

import React, { createContext, useContext, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError, createApiClient, defaultApiClient } from "../client";
import { handleSessionExpired } from "../../auth/sessionExpired";

export type ApiClient = ReturnType<typeof createApiClient>;

const ApiContext = createContext<ApiClient>(defaultApiClient);

/** The API client used by every query hook. Tests and Storybook pass their own. */
export function useApi(): ApiClient {
  return useContext(ApiContext);
}

/** Client errors (4xx) will not succeed on retry; network and 5xx errors get two retries. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: shouldRetry },
      mutations: { retry: false },
    },
  });
}

export function AppProviders({
  children,
  client,
  queryClient,
}: {
  children: React.ReactNode;
  client?: ApiClient;
  queryClient?: QueryClient;
}) {
  const [qc] = useState(() => queryClient ?? makeQueryClient());
  // The default client signs the user out of the UI on any 401 outside /auth/*.
  const [api] = useState<ApiClient>(
    () =>
      client ??
      createApiClient({
        getLocale: () => (document.documentElement.lang === "en" ? "en" : "bn"),
        onUnauthenticated: () => handleSessionExpired(qc, window.location, (url) => window.location.assign(url)),
      }),
  );
  return (
    <ApiContext.Provider value={api}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}
