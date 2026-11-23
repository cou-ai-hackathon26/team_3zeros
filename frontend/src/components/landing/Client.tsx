"use client";

import React, { useEffect, useState } from "react";
import type { Locale } from "../../i18n/config";
import { ConsentSheet } from "../ConsentSheet/ConsentSheet";
import { buttonVariants } from "../ui/button";

/**
 * Phones only: a sticky Start bar that appears after the hero's button has scrolled away and goes
 * again when the final call is visible, so two primary buttons are never on screen (LANDING §6).
 * Without JavaScript it simply never appears. It does not animate.
 */
export function StickyStartBar({ href, label }: { href: string; label: string }) {
  const [heroVisible, setHeroVisible] = useState(true);
  const [finalVisible, setFinalVisible] = useState(false);
  const [heroSeen, setHeroSeen] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("hero-cta");
    const final = document.getElementById("final-cta");
    if (!hero || typeof IntersectionObserver === "undefined") return;
    const heroObs = new IntersectionObserver(([e]) => {
      setHeroVisible(e.isIntersecting);
      if (e.isIntersecting) setHeroSeen(true);
    });
    heroObs.observe(hero);
    const finalObs = final ? new IntersectionObserver(([e]) => setFinalVisible(e.isIntersecting)) : null;
    if (final && finalObs) finalObs.observe(final);
    return () => {
      heroObs.disconnect();
      finalObs?.disconnect();
    };
  }, []);

  const show = heroSeen && !heroVisible && !finalVisible;
  if (!show) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper p-3 sm:hidden">
      <a href={href} className={buttonVariants({ size: "lg", className: "w-full" })}>{label}</a>
    </div>
  );
}

/** Moves focus to a section's heading when a header or footer anchor is used, so keyboard and screen-reader users land there. */
export function SectionFocus() {
  useEffect(() => {
    function focusHeading() {
      const id = window.location.hash.slice(1);
      const heading = id ? document.getElementById(id)?.querySelector<HTMLElement>("h2") : null;
      heading?.focus({ preventScroll: true });
    }
    window.addEventListener("hashchange", focusHeading);
    return () => window.removeEventListener("hashchange", focusHeading);
  }, []);
  return null;
}

const noop = () => {};

/**
 * The real ConsentSheet with sample data. It lives here because a server component cannot pass
 * event handlers to a client component. It is rendered inside an inert container, so the buttons
 * are never reachable.
 */
export function ConsentPreview(props: {
  locale: Locale;
  doctor: string;
  facility: string;
  purpose: string;
  categories: string[];
}) {
  return (
    <ConsentSheet
      recipientPractitioner={props.doctor}
      recipientFacility={props.facility}
      purpose={props.purpose}
      categories={props.categories}
      locale={props.locale}
      onGrant={noop}
      onRefuse={noop}
    />
  );
}
