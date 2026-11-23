/**
 * Type-safe API client (FRONTEND §4-5, MASTERPLAN §6.1-6.2).
 * - First-party session cookies (credentials: "same-origin"), never tokens in localStorage.
 * - CSRF token header X-CSRFToken on all unsafe methods.
 * - Single-intent Idempotency-Key generated once per user button press and reused across retries.
 * - If-Match header for optimistic concurrency on existing objects.
 * - Canonical error envelope mapping to i18n keys error.<code>.
 */

import createClient from "openapi-fetch";
import type { paths } from "./schema";
import type { Locale } from "../i18n/config";

export const KNOWN_ERROR_CODES = new Set([
  "validation_error",
  "not_authenticated",
  "mfa_required",
  "permission_denied",
  "consent_required",
  "csrf_failed",
  "not_found",
  "transition_not_allowed",
  "slot_unavailable",
  "idempotency_conflict",
  "duplicate_candidate",
  "stale_version",
  "sync_pending",
  "rate_limited",
  "fhir_unavailable",
  "provider_unavailable",
]);

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string[]>;
  readonly requestId?: string;
  readonly i18nKey: string;
  readonly rawBody?: unknown;

  constructor(params: {
    status: number;
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
    requestId?: string;
    rawBody?: unknown;
  }) {
    super(params.message);
    this.name = "ApiError";
    this.status = params.status;
    this.code = params.code;
    this.fieldErrors = params.fieldErrors ?? {};
    this.requestId = params.requestId;
    this.i18nKey = KNOWN_ERROR_CODES.has(params.code) ? `error.${params.code}` : "error.generic";
    this.rawBody = params.rawBody;
  }
}

export function createIntentIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function readCsrfCookie(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function isUnsafeMethod(method: string): boolean {
  const upper = method.toUpperCase();
  return upper === "POST" || upper === "PUT" || upper === "PATCH" || upper === "DELETE";
}

export interface ApiClientOptions {
  baseUrl?: string;
  getCsrfToken?: () => string;
  getLocale?: () => Locale;
  fetchImpl?: typeof fetch;
  onUnauthenticated?: () => void;
  onMfaRequired?: () => void;
}

export interface RequestOptions {
  body?: unknown;
  idempotencyKey?: string;
  expectedVersion?: number;
  headers?: Record<string, string>;
}

export async function toApiError(response: Response): Promise<ApiError> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const errObj =
    payload && typeof payload === "object" && "error" in payload
      ? (payload as { error: Record<string, unknown> }).error
      : null;

  const code = typeof errObj?.code === "string" ? errObj.code : "generic";
  const message =
    typeof errObj?.message === "string"
      ? errObj.message
      : `Request failed with status ${response.status}`;
  const fieldErrors =
    errObj?.field_errors && typeof errObj.field_errors === "object"
      ? (errObj.field_errors as Record<string, string[]>)
      : {};
  const requestId = typeof errObj?.request_id === "string" ? errObj.request_id : undefined;

  return new ApiError({
    status: response.status,
    code,
    message,
    fieldErrors,
    requestId,
    rawBody: payload,
  });
}

export function createApiClient(options?: ApiClientOptions) {
  const baseUrl = (options?.baseUrl ?? "/api/v1").replace(/\/$/, "");
  const getCsrfToken = options?.getCsrfToken ?? readCsrfCookie;
  const getLocale = options?.getLocale ?? (() => "bn" as Locale);
  const fetchImpl = options?.fetchImpl ?? fetch;

  async function request<T = unknown>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    reqOptions?: RequestOptions
  ): Promise<{ data: T; status: number }> {
    const rawPath = path.startsWith("http") ? path : `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const origin =
      typeof window !== "undefined" && window.location?.origin && window.location.origin !== "null"
        ? window.location.origin
        : "http://localhost";
    const url = rawPath.startsWith("http") ? rawPath : `${origin}${rawPath}`;
    const headers = new Headers(reqOptions?.headers);
    headers.set("Accept", "application/json");
    headers.set("Accept-Language", getLocale());

    if (isUnsafeMethod(method)) {
      const csrf = getCsrfToken();
      if (csrf) {
        headers.set("X-CSRFToken", csrf);
      }
      const idempKey = reqOptions?.idempotencyKey ?? createIntentIdempotencyKey();
      headers.set("Idempotency-Key", idempKey);
    }

    if (reqOptions?.expectedVersion !== undefined) {
      headers.set("If-Match", String(reqOptions.expectedVersion));
    }

    let bodyInit: BodyInit | undefined;
    if (reqOptions?.body !== undefined) {
      if (typeof FormData !== "undefined" && reqOptions.body instanceof FormData) {
        bodyInit = reqOptions.body;
      } else {
        headers.set("Content-Type", "application/json");
        bodyInit = JSON.stringify(reqOptions.body);
      }
    }

    const req = new Request(url, {
      method,
      headers,
      body: bodyInit,
      credentials: "same-origin",
    });

    const response = await fetchImpl(req);
    if (!response.ok) {
      const apiError = await toApiError(response);
      if (apiError.status === 401) {
        if (apiError.code === "mfa_required") {
          options?.onMfaRequired?.();
        } else if (!path.startsWith("/auth/")) {
          // A 401 from /auth/* is a sign-in answer (bad credentials, signed out), not an expired session.
          options?.onUnauthenticated?.();
        }
      }
      throw apiError;
    }

    const data = (response.status === 204 ? null : await response.json()) as T;
    return { data, status: response.status };
  }

  const openapi = createClient<paths>({
    baseUrl: baseUrl.startsWith("http") ? baseUrl : `http://localhost${baseUrl}`,
    credentials: "same-origin",
    fetch: fetchImpl,
  });

  return {
    openapi,
    request,
    get: <T = unknown>(path: string, opts?: RequestOptions) => request<T>("GET", path, opts),
    post: <T = unknown>(path: string, opts?: RequestOptions) => request<T>("POST", path, opts),
    patch: <T = unknown>(path: string, opts?: RequestOptions) => request<T>("PATCH", path, opts),
  };
}

export const defaultApiClient = createApiClient();
