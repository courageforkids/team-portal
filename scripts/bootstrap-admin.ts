/**
 * Production setup: creates departments, default categories, settings and ONE administrator.
 * Usage: ADMIN_EMAIL=you@org ADMIN_NAME="Your Name" ADMIN_PASSWORD='…' npm run bootstrap
 */
import { eq } from "drizzle-orm";
import { connect, DEPARTMENTS, CATEGORIES } from "./lib";
import { departments, settings, taskCategories, users } from "../src/db/schema";
import { hashPassword, passwordProblem } from "../src/server/crypto";

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const name = process.env.ADMIN_NAME?.trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || !name) throw new Error("Set ADMIN_EMAIL and ADMIN_NAME");
  const problem = passwordProblem(password);
  if (problem) throw new Error(`ADMIN_PASSWORD: ${problem}`);
  const { db, close } = connect();
  await db.insert(departments).values([...DEPARTMENTS]).onConflictDoNothing();
  await db.insert(taskCategories).values(CATEGORIES).onConflictDoNothing();
  await db.insert(settings).values({ id: 1, data: {
    orgName: "Courage for Kids", tagline: "Their fight. Our mission.", reminderHours: [48, 24], overdueReminders: true,
    emailEnabled: false, emailFrom: "", quietHoursStart: 21, quietHoursEnd: 7, timezone: "America/New_York",
  } }).onConflictDoNothing();
  const exec = (await db.select().from(departments).where(eq(departments.slug, "executive")))[0];
  const existing = (await db.select().from(users).where(eq(users.email, email)))[0];
  if (existing) {
    await db.update(users).set({ role: "admin", status: "active", passwordHash: await hashPassword(password) }).where(eq(users.id, existing.id));
    console.log(`Updated existing user ${email} as administrator.`);
  } else {
    await db.insert(users).values({ email, name, role: "admin", title: "Founder & Executive Director", departmentId: exec?.id, passwordHash: await hashPassword(password) });
    console.log(`Created administrator ${email}.`);
  }
  await close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
