import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function flatten(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

/** Keys present in one locale's landing copy and missing from the other. */
export function landingKeyDiff(en, bn) {
  const a = new Set(flatten(en.landing));
  const b = new Set(flatten(bn.landing));
  return { missingInBn: [...a].filter((k) => !b.has(k)), missingInEn: [...b].filter((k) => !a.has(k)) };
}

/** Reasons the landing copy cannot launch yet (LANDING_PAGE §9). Empty means ready. */
export function launchProblems(review) {
  const problems = [];
  for (const locale of ["bn", "en"]) {
    if (review[locale]?.status !== "reviewed") problems.push(`${locale} copy is "${review[locale]?.status}", not reviewed by a writer`);
  }
  if (!review.bn?.clinicalReviewer) problems.push(`bn sections ${review.bn?.clinicalSections?.join(", ")} have no clinical reviewer`);
  return problems;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const diff = landingKeyDiff({ landing: read("i18n/messages/landing.en.json") }, { landing: read("i18n/messages/landing.bn.json") });
  let failed = false;
  for (const [label, keys] of Object.entries(diff)) {
    if (keys.length) {
      failed = true;
      console.error(`${label}: ${keys.join(", ")}`);
    }
  }
  const problems = launchProblems(read("content/landing-review.json"));
  if (process.argv.includes("--launch") && problems.length) {
    failed = true;
    console.error("Landing copy is not ready to launch:\n - " + problems.join("\n - "));
  } else if (problems.length) {
    console.log("Not launch-ready (run with --launch to enforce):\n - " + problems.join("\n - "));
  }
  if (failed) process.exit(1);
  console.log("content:check passed.");
}
