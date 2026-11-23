import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LOCALES, DEFAULT_PATIENT_LOCALE } from "./i18n/config";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/patients",
  "/referrals",
  "/emergency",
  "/appointments",
  "/consents",
  "/reports",
  "/facility",
  "/schedules",
  "/capacity",
  "/staff",
];

/**
 * FRONTEND §3-4 & SECURITY §3.2:
 * Locale prefix guard + coarse unauthenticated redirect based on session cookie presence.
 * Actual authorization is always enforced on the Django server (INV-9).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/ws") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];
  const hasLocale = LOCALES.includes(firstSegment as (typeof LOCALES)[number]);

  if (!hasLocale) {
    const url = request.nextUrl.clone();
    url.pathname = `/${DEFAULT_PATIENT_LOCALE}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }

  const locale = firstSegment;
  const subPath = `/${segments.slice(1).join("/")}`;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => subPath === prefix || subPath.startsWith(`${prefix}/`));

  if (isProtected) {
    const hasSessionCookie =
      request.cookies.has("__Host-sessionid") || request.cookies.has("sessionid");
    if (!hasSessionCookie && process.env.NODE_ENV === "production") {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = `/${locale}/login`;
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
