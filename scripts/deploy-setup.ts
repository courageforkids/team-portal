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
import { departments, settings, taskCategories, users } from "../src/db/schema";
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
    if (exists) console.log("[deploy-setup] Admin already exists — leaving it unchanged.");
    else if (passwordProblem(password)) console.log(`[deploy-setup] ADMIN_PASSWORD rejected: ${passwordProblem(password)}`);
    else {
      const exec = (await db.select().from(departments).where(eq(departments.slug, "executive")))[0];
      await db.insert(users).values({ email, name, role: "admin", title: "Founder & Executive Director", departmentId: exec?.id, passwordHash: await hashPassword(password) });
      console.log(`[deploy-setup] Created administrator ${email}.`);
    }
  }
  await close();
}
main().catch((e) => { console.error("[deploy-setup] failed:", e.message); process.exit(1); });
