import React from "react";
import type { Preview } from "@storybook/nextjs-vite";
import { Hind_Siliguri, Tiro_Bangla } from "next/font/google";
import "../src/app/globals.css";

const hind = Hind_Siliguri({ subsets: ["bengali", "latin"], weight: ["400", "500", "600"], variable: "--font-hind-siliguri" });
const tiro = Tiro_Bangla({ subsets: ["bengali", "latin"], weight: "400", variable: "--font-tiro-bangla" });

// Emulates `prefers-reduced-motion: reduce` by zeroing the motion tokens, the same
// thing tokens.css does under the media query.
const REDUCED = ":root{--motion-feedback-duration:0ms;--motion-state-duration:0ms;--motion-handover-duration:0ms;--motion-page-duration:0ms;--motion-reveal-duration:0ms}";

const preview: Preview = {
  globalTypes: {
    motion: {
      description: "Motion preference",
      toolbar: { title: "Motion", items: ["normal", "reduced"], dynamicTitle: true },
    },
  },
  initialGlobals: { motion: "normal" },
  decorators: [
    (Story, ctx) => (
      <div className={`${hind.variable} ${tiro.variable}`}>
        {ctx.globals.motion === "reduced" && <style>{REDUCED}</style>}
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "padded", a11y: { test: "error" } },
};
export default preview;
