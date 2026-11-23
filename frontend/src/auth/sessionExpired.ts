import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../api/queries";

/**
 * Any API 401 while signed in (AUTH_RBAC §4.3): clear every cache and go to the
 * signed-out screen, remembering where the user was. Does nothing when nobody
 * was signed in, so public pages never redirect.
 */
export function handleSessionExpired(
  qc: QueryClient,
  location: { pathname: string; search: string },
  navigate: (url: string) => void,
): void {
  if (!qc.getQueryData(queryKeys.me)) return;
  qc.clear();
  const locale = location.pathname.split("/")[1] === "en" ? "en" : "bn";
  const next = encodeURIComponent(`${location.pathname}${location.search}`);
  navigate(`/${locale}/signed-out?reason=expired&next=${next}`);
}
