import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LOCALES, DEFAULT_PATIENT_LOCALE } from "./i18n/config";

import { areaOfPath, isOpenPath } from "./auth/access";

const SHARED_PROTECTED = ["/notifications"];

const matches = (subPath: string, prefix: string) => subPath === prefix || subPath.startsWith(`${prefix}/`);

/**
 * Locale prefix + coarse redirect when no session cookie is present, in every
 * environment (AUTH_RBAC §5.4). It checks cookie presence only; it is not
 * authorization, which the Django API enforces (INV-9). `NEXT_PUBLIC_AUTH_GUARD=off`
 * exists for component tests only.
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
  const area = areaOfPath(subPath);
  const isProtected =
    !isOpenPath(subPath) &&
    (area !== null || SHARED_PROTECTED.some((p) => matches(subPath, p)));

  const guardOff = process.env.NEXT_PUBLIC_AUTH_GUARD === "off" && process.env.NODE_ENV !== "production";
  if (isProtected && !guardOff) {
    const hasSessionCookie = request.cookies.has("__Host-sessionid") || request.cookies.has("sessionid");
    if (!hasSessionCookie) {
      const loginUrl = request.nextUrl.clone();
      // Staff areas go to the staff form; everything else to patient sign-in.
      loginUrl.pathname = area === "clinical" || area === "admin" ? `/${locale}/login/staff` : `/${locale}/login`;
      loginUrl.search = "";
      loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
