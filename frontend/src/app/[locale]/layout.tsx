import React from "react";
import { Hind_Siliguri, Tiro_Bangla } from "next/font/google";
import "../globals.css";
import { SessionProvider } from "../../auth/session";
import { AppProviders } from "../../api/queries/provider";
import { resolveSyncLocale, type LocaleLayoutProps } from "../resolveLocale";

const hindSiliguri = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-hind-siliguri",
});

const tiroBangla = Tiro_Bangla({
  subsets: ["bengali", "latin"],
  weight: "400",
  display: "swap",
  variable: "--font-tiro-bangla",
});

export default async function LocaleRootLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const resolved =
    params && typeof (params as Promise<unknown>).then === "function"
      ? await params
      : params;
  const locale = resolveSyncLocale(resolved, "bn");
  return (
    <html
      lang={locale}
      className={`${hindSiliguri.variable} ${tiroBangla.variable}`}
    >
      <body>
        <AppProviders>
          <SessionProvider>{children}</SessionProvider>
        </AppProviders>
      </body>
    </html>
  );
}
