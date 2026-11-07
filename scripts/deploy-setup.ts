/**
 * Runs during each deploy (before `next build`):
 * 1. applies database migrations;
 * 2. if ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD are set and that admin doesn't exist yet, creates it.
 * Safe to run every time.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { eq } from "drizzle-orm";
import { connect, DEPARTMENTS, CATEGORIES } from "./lib";
import { apiKeys, departments, settings, taskCategories, users } from "../src/db/schema";
import { readFileSync, existsSync } from "node:fs";
import { hashPassword, passwordProblem } from "../src/server/crypto";

async function main() {
  if (!process.env.DATABASE_URL) { console.log("[deploy-setup] DATABASE_URL not set — skipping."); return; }
  execSync("npx drizzle-kit migrate", { stdio: "inherit" });
  const { db, close } = connect();
  await db.insert(departments).values([...DEPARTMENTS]).onConflictDoNothing();
  if (!(await db.select().from(taskCategories).limit(1)).length) await db.insert(taskCategories).values(CATEGORIES).onConflictDoNothing();
  await db.insert(settings).values({ id: 1, data: {
    orgName: "Courage for Kids", tagline: "Their fight. Our mission.", reminderHours: [48, 24], overdueReminders: true,
    emailEnabled: false, emailFrom: "", quietHoursStart: 21, quietHoursEnd: 7, timezone: "America/New_York",
  } }).onConflictDoNothing();
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const name = process.env.ADMIN_NAME?.trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (email && name) {
    const exists = (await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0];
    const reset = (process.env.ADMIN_PASSWORD_RESET ?? "").toLowerCase() === "yes";
    if (passwordProblem(password)) console.log(`[deploy-setup] ADMIN_PASSWORD rejected: ${passwordProblem(password)}`);
    else if (exists && reset) {
      await db.update(users).set({ passwordHash: await hashPassword(password), role: "admin", status: "active", updatedAt: new Date() }).where(eq(users.id, exists.id));
      console.log(`[deploy-setup] Reset the password for administrator ${email}. Remove ADMIN_PASSWORD_RESET now.`);
    }
    else if (exists) console.log("[deploy-setup] Admin already exists — leaving it unchanged (set ADMIN_PASSWORD_RESET=yes to reset its password).");
    else {
      const exec = (await db.select().from(departments).where(eq(departments.slug, "executive")))[0];
      await db.insert(users).values({ email, name, role: "admin", title: "Founder & Executive Director", departmentId: exec?.id, passwordHash: await hashPassword(password) });
      console.log(`[deploy-setup] Created administrator ${email}.`);
    }
  }
  await registerBootstrapKeys(db);
  await close();
}

/**
 * Registers API keys listed (as hashes only) in deploy/bootstrap-api-keys.json, owned by the main administrator.
 * Each key is added once; a key that was later revoked is never re-added.
 */
async function registerBootstrapKeys(db: ReturnType<typeof connect>["db"]) {
  const file = "deploy/bootstrap-api-keys.json";
  if (!existsSync(file)) return;
  const list = JSON.parse(readFileSync(file, "utf8")) as { name: string; hash: string; prefix: string; expiresInDays?: number }[];
  const owner = process.env.ADMIN_EMAIL
    ? (await db.select().from(users).where(eq(users.email, process.env.ADMIN_EMAIL.toLowerCase().trim())).limit(1))[0]
    : (await db.select().from(users).where(eq(users.role, "admin")).limit(1))[0];
  if (!owner || owner.role !== "admin") { console.log("[deploy-setup] No administrator to own bootstrap API keys — skipping."); return; }
  for (const k of list) {
    if (!/^[0-9a-f]{64}$/.test(k.hash)) continue;
    const exists = (await db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.keyHash, k.hash)).limit(1))[0];
    if (exists) continue;
    await db.insert(apiKeys).values({
      name: k.name, keyHash: k.hash, prefix: k.prefix, createdById: owner.id,
      expiresAt: k.expiresInDays ? new Date(Date.now() + k.expiresInDays * 86400_000) : null,
    });
    console.log(`[deploy-setup] Registered API key “${k.name}” for ${owner.email}.`);
  }
}
main().catch((e) => { console.error("[deploy-setup] failed:", e.message); process.exit(1); });
