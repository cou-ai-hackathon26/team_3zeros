#!/usr/bin/env node
/**
 * Bundle budget checker (MASTERPLAN §2.2, PRODUCT_PLAN §Phase F).
 * Enforces first-load JS budget for patient routes: ≤ 170 KB gzipped.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const BUDGET_KB = 170;
const BUDGET_BYTES = BUDGET_KB * 1024;

const nextDir = path.resolve(process.cwd(), ".next");
const appManifestPath = path.join(nextDir, "app-build-manifest.json");

if (!fs.existsSync(appManifestPath)) {
  console.log(`[INFO] No production build manifest found at ${appManifestPath}. Run 'npm run build' first.`);
  process.exit(0);
}

try {
  const manifest = JSON.parse(fs.readFileSync(appManifestPath, "utf8"));
  const pages = manifest.pages || {};
  let failed = false;

  console.log(`[INFO] Checking patient route first-load bundle budgets (Limit: ${BUDGET_KB} KB gzipped)...`);

  for (const [pagePath, files] of Object.entries(pages)) {
    // Check routes belonging to patient experience
    if (pagePath.includes("(patient)") || pagePath.includes("/login") || pagePath.includes("/register")) {
      const uniqueFiles = new Set(files);
      let totalGzipBytes = 0;

      for (const file of uniqueFiles) {
        const fullPath = path.join(nextDir, file);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath);
          const gzipped = zlib.gzipSync(content);
          totalGzipBytes += gzipped.length;
        }
      }

      const totalKb = (totalGzipBytes / 1024).toFixed(2);
      if (totalGzipBytes > BUDGET_BYTES) {
        console.error(`[FAIL] ${pagePath}: ${totalKb} KB exceeds budget of ${BUDGET_KB} KB!`);
        failed = true;
      } else {
        console.log(`[PASS] ${pagePath}: ${totalKb} KB <= ${BUDGET_KB} KB`);
      }
    }
  }

  if (failed) {
    process.exit(1);
  } else {
    console.log("[SUCCESS] All evaluated patient routes meet the first-load budget.");
  }
} catch (err) {
  console.error("[ERROR] Failed to evaluate bundle budgets:", err);
  process.exit(1);
}
