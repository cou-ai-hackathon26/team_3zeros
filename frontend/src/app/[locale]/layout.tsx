import React from "react";
import { Anek_Bangla, Anek_Latin } from "next/font/google";
import "../../tokens/tokens.css";
import { SessionProvider } from "../../auth/session";
import { resolveSyncLocale, type LocaleLayoutProps } from "../resolveLocale";

const anekBangla = Anek_Bangla({
  subsets: ["bengali"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-anek-bangla",
});

const anekLatin = Anek_Latin({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-anek-latin",
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
      className={`${anekBangla.variable} ${anekLatin.variable}`}
    >
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
