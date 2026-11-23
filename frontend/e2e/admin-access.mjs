import { createRequire } from "node:module";
import fs from "node:fs";
import crypto from "node:crypto";
const require = createRequire("/Users/mushh/medi_waypoint/frontend/package.json");
const { chromium } = require("@playwright/test");
// End-to-end check of admin access control in real Chrome (MASTERPLAN D-16, D-17, D-18).
//
// Needs: a backend on a throwaway database with `seed_demo_data.py` run and one platform admin created with
//   python manage.py create_platform_admin --email root@example.org --name "Root Admin" > root.txt
// (CSRF_TRUSTED_ORIGINS must include the frontend origin), and a production build of the frontend
// proxying to that backend. Never point this at a real database: it creates, deactivates and resets accounts,
// and the last step deliberately trips the sign-in rate limit for this client address.
//
//   E2E_DIR=<dir with root.txt; screenshots go to <dir>/shots> E2E_BASE_URL=http://localhost:3100 node e2e/admin-access.mjs
const S = process.env.E2E_DIR, B = process.env.E2E_BASE_URL ?? "http://localhost:3100";
if (!S) throw new Error("Set E2E_DIR to the folder that holds root.txt");
fs.mkdirSync(S + "/shots", { recursive: true });
const root = fs.readFileSync(S + "/root.txt", "utf8");
const rootPw = /Temporary password: (\S+)/.exec(root)[1];
const rootSecret = /secret=([A-Z2-7]+)/.exec(root)[1];

function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
  for (const c of secret) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = crypto.createHmac("sha1", key).update(buf).digest(); const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}
const results = [];
const note = (name, ok, detail = "") => { results.push({ name, ok }); console.log((ok ? "PASS " : "FAIL ") + name + (detail ? "  [" + detail + "]" : "")); };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = async () => (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let shot = 0;
const snap = (page, label) => page.screenshot({ path: `${S}/shots/${String(++shot).padStart(2, "0")}-${label}.png` });
async function step(name, fn) { try { await fn(); } catch (e) { note(name, false, String(e.message).split("\n")[0].slice(0, 160)); } }
const navNames = async (page) => { await page.locator("nav a").first().waitFor(); return (await page.locator("nav a").allTextContents()).map((s) => s.trim()); };
const alertOf = (page) => page.locator("[role=alert]").filter({ hasText: /\S/ }).first();

async function adminSignIn(page, id, pw, secret) {
  await page.goto(B + "/en/admin/login");
  await page.getByLabel(/Email or username/).fill(id);
  await page.getByLabel(/^Password/).fill(pw);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("heading", { name: "Enter your verification code" }).waitFor();
  await page.getByLabel(/^Code/).fill(totp(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL("**/en/facility");
}
async function staffSignIn(page, id, pw) {
  await page.goto(B + "/en/login/staff");
  await page.getByLabel(/Email or username/).fill(id);
  await page.getByLabel(/^Password/).fill(pw);
  await page.getByRole("button", { name: "Sign in" }).click();
}

const admin = await ctx();
await step("1 platform admin signs in at the admin URL with TOTP", async () => {
  await adminSignIn(admin, "root@example.org", rootPw, rootSecret);
  const nav = await navNames(admin);
  await snap(admin, "admin-home");
  note("1 platform admin signs in at the admin URL with TOTP", ["Facility", "Schedules", "Capacity", "Staff"].every((n) => nav.includes(n)) && !nav.includes("Queue"), nav.join(", "));
});

await step("2 staff entrance refuses an admin account", async () => {
  const p = await ctx();
  await staffSignIn(p, "root@example.org", rootPw);
  await alertOf(p).waitFor();
  const msg = await alertOf(p).textContent();
  note("2 staff entrance refuses an admin account with the wrong-password message", /not right/.test(msg) && p.url().includes("/login/staff"), msg.trim());
  await p.context().close();
});

await step("3 admin creates a clinician and sees the password once", async () => {
  await admin.goto(B + "/en/staff");
  await admin.getByRole("button", { name: "Add staff member" }).click();
  await admin.getByLabel(/^Name/).fill("Dr. Test Clinician");
  await admin.getByLabel(/Email or username/).fill("dr.test@example.org");
  await admin.getByRole("combobox", { name: /Role/ }).selectOption("clinician");
  await admin.getByLabel(/BMDC registration number/).fill("BMDC-T-1001");
  await admin.getByRole("checkbox", { name: "Acknowledge or decline incoming referrals" }).click();
  await admin.getByRole("checkbox", { name: "Create outgoing referrals" }).click();
  await snap(admin, "create-dialog");
  await admin.getByRole("button", { name: "Create account" }).click();
  await admin.getByText("Save these now").waitFor();
  global.clinicianPw = (await admin.locator("code").first().textContent()).trim();
  await snap(admin, "secrets-once");
  await admin.getByRole("button", { name: "Done" }).click();
  const body = await admin.locator("body").textContent();
  note("3 temporary password shown once, then gone", global.clinicianPw.length >= 12 && !body.includes(global.clinicianPw) && body.includes("Dr. Test Clinician"));
});

const clin = await ctx();
await step("4 the new clinician signs in and gets only the clinical area", async () => {
  await staffSignIn(clin, "dr.test@example.org", global.clinicianPw);
  await clin.waitForURL("**/en/dashboard");
  const nav = await navNames(clin);
  await snap(clin, "clinician-dashboard");
  note("4 clinician lands on the queue with clinical navigation only", ["Queue", "Patients", "Referrals"].every((n) => nav.includes(n)) && !nav.includes("Staff"), nav.join(", "));
  await clin.goto(B + "/en/staff");
  await clin.getByRole("heading", { name: "This area is not part of your account" }).waitFor();
  note("4b clinician opening the admin URL gets not-authorised", true);
  await snap(clin, "clinician-not-authorised");
});

await step("5 deactivate ends access at once, reactivate restores it", async () => {
  await admin.goto(B + "/en/staff");
  const row = admin.getByRole("row", { name: /Dr\. Test Clinician/ });
  await row.getByRole("button", { name: "Deactivate" }).click();
  await admin.getByRole("alertdialog", { name: /Deactivate Dr\. Test Clinician\?/ }).getByRole("button", { name: "Deactivate" }).click();
  await admin.getByRole("row", { name: /Dr\. Test Clinician.*Deactivated/ }).waitFor();
  await snap(admin, "deactivated");
  await clin.goto(B + "/en/dashboard");
  await clin.waitForURL(/login\/staff/);
  note("5a open session of the deactivated clinician is gone", true);
  const again = await ctx();
  await staffSignIn(again, "dr.test@example.org", global.clinicianPw);
  await alertOf(again).waitFor();
  note("5b deactivated clinician cannot sign in", again.url().includes("/login/staff"));
  await again.context().close();
  await admin.getByRole("row", { name: /Dr\. Test Clinician/ }).getByRole("button", { name: "Reactivate" }).click();
  await admin.getByRole("row", { name: /Dr\. Test Clinician.*Active/ }).waitFor();
  const back = await ctx();
  await staffSignIn(back, "dr.test@example.org", global.clinicianPw);
  await back.waitForURL("**/en/dashboard");
  note("5c reactivated clinician signs in again", true);
  await back.context().close();
});

await step("6 reset password: old fails, new works", async () => {
  const row = admin.getByRole("row", { name: /Dr\. Test Clinician/ });
  await row.getByRole("button", { name: "Reset password" }).click();
  await admin.getByRole("alertdialog").getByRole("button", { name: "Reset password" }).click();
  await admin.getByText("Save these now").waitFor();
  const fresh = (await admin.locator("code").first().textContent()).trim();
  await admin.getByRole("button", { name: "Done" }).click();
  const a = await ctx(); await staffSignIn(a, "dr.test@example.org", global.clinicianPw); await alertOf(a).waitFor();
  const b = await ctx(); await staffSignIn(b, "dr.test@example.org", fresh); await b.waitForURL("**/en/dashboard");
  note("6 old password refused, new temporary password accepted", true);
  await a.context().close(); await b.context().close();
});

await step("7 patient registers with email and password, and is kept out of staff areas", async () => {
  const p = await ctx();
  await p.goto(B + "/en/register");
  await p.getByLabel(/Your name/).fill("Test Patient");
  await p.getByLabel(/Email or username/).fill("patient.test@example.org");
  await p.getByLabel(/^Password/).fill("a-long-passphrase-9");
  await snap(p, "register");
  await p.getByRole("button", { name: "Create account" }).click();
  await p.waitForURL("**/en/home");
  await snap(p, "patient-home");
  const nav = await navNames(p);
  await p.goto(B + "/en/dashboard");
  await p.getByRole("heading", { name: "This area is not part of your account" }).waitFor();
  note("7 patient registered, lands on home, cannot open the clinical area", nav.includes("Doctors") && !nav.includes("Queue"), nav.join(", "));
  await p.context().close();
});

await step("8 platform admin creates a facility admin who is limited", async () => {
  await admin.goto(B + "/en/staff");
  await admin.getByRole("button", { name: "Add staff member" }).click();
  await admin.getByLabel(/^Name/).fill("Facility Admin One");
  await admin.getByLabel(/Email or username/).fill("fa.one@example.org");
  await admin.getByRole("combobox", { name: /Role/ }).selectOption("facility_admin");
  await admin.getByRole("button", { name: "Create account" }).click();
  await admin.getByText("Save these now").waitFor();
  const codes = await admin.locator("code").allTextContents();
  const pw = codes[0].trim(); const secret = /secret=([A-Z2-7]+)/.exec(codes[1])[1];
  await admin.getByRole("button", { name: "Done" }).click();
  const fa = await ctx();
  await adminSignIn(fa, "fa.one@example.org", pw, secret);
  await fa.goto(B + "/en/staff");
  await fa.getByRole("heading", { name: /Staff/ }).first().waitFor();
  await fa.getByRole("button", { name: "Add staff member" }).click();
  const roles = await fa.getByRole("combobox", { name: /Role/ }).locator("option").allTextContents();
  const facilities = new Set(await fa.locator("tbody tr td:nth-child(1)").allTextContents());
  await snap(fa, "facility-admin-create");
  note("8 facility admin signs in via the admin URL, cannot grant the admin role", !roles.includes("Facility admin") && roles.includes("Clinician"), roles.join(", "));
  await fa.context().close();
});

await step("9 repeated wrong passwords are rate limited", async () => {
  const p = await ctx();
  let last = "";
  for (let i = 0; i < 7; i++) {
    await p.goto(B + "/en/login");
    await p.getByLabel(/Email or username/).fill("nobody@example.org");
    await p.getByLabel(/^Password/).fill("wrong-password");
    await p.getByRole("button", { name: "Sign in" }).click();
    await alertOf(p).waitFor();
    last = (await alertOf(p).textContent()).trim();
  }
  await snap(p, "rate-limited");
  note("9 sixth and later attempts are told to wait", /Too many attempts/.test(last), last);
  await p.context().close();
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
