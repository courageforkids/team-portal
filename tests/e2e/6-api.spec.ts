import { test, expect } from "@playwright/test";
import { as, sql, toast } from "./helpers";

test("an admin-created API key can create tasks, events, shifts, announcements and resources, and stops working when revoked", async ({ browser, request }) => {
  const admin = await as(browser, "jacob");
  await admin.page.goto("/settings/api-keys");
  await admin.page.fill("#ak-name", "E2E Claude");
  await admin.page.getByRole("button", { name: "Create key" }).click();
  const key = await admin.page.getByTestId("copy-value").inputValue();
  expect(key).toMatch(/^cfk_/);
  const [stored] = await sql`select key_hash from api_keys where name = 'E2E Claude' order by created_at desc limit 1`;
  expect(stored.key_hash).not.toContain(key); // only a hash is stored
  const H = { Authorization: `Bearer ${key}` };

  expect((await request.get("/api/v1")).status()).toBe(401);
  const idx = await request.get("/api/v1", { headers: H });
  expect((await idx.json()).actingAs.name).toBe("Jacob Rogers");

  const title = `API task ${Date.now()}`;
  const created = await request.post("/api/v1/tasks", { headers: H, data: { title, assignees: ["Arleigh", "Owen"], dueAt: "2026-12-20T17:00", priority: "high", submissionTypes: ["file"], department: "Media" } });
  expect(created.status(), await created.text()).toBe(200);
  const { taskIds } = await created.json();
  expect(taskIds).toHaveLength(2); // separate copy per person by default
  const [t] = await sql`select title, priority, due_at from tasks where id = ${taskIds[0]}`;
  expect(t.priority).toBe("high");
  expect(new Date(t.due_at).toISOString()).toBe("2026-12-20T22:00:00.000Z"); // 5 PM Eastern

  const patched = await request.patch(`/api/v1/tasks/${taskIds[0]}`, { headers: H, data: { dueAt: "2026-12-22T17:00", status: "excused", reason: "Out of town" } });
  expect(patched.status(), await patched.text()).toBe(200);
  expect((await sql`select status from tasks where id = ${taskIds[0]}`)[0].status).toBe("excused");

  const bad = await request.post("/api/v1/tasks", { headers: H, data: { title: "Nobody", assignees: ["Zzyzx"] } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toContain("Zzyzx");

  const ev = await (await request.post("/api/v1/events", { headers: H, data: { title: "API event", type: "volunteer", startsAt: "2026-12-01T18:00", endsAt: "2026-12-01T21:00", location: "Downtown" } })).json();
  const shift = await request.post(`/api/v1/events/${ev.id}/shifts`, { headers: H, data: { label: "Setup", startsAt: "2026-12-01T17:30", endsAt: "2026-12-01T18:30", capacity: 3 } });
  expect(shift.status(), await shift.text()).toBe(200);
  const ann = await request.post("/api/v1/announcements", { headers: H, data: { title: "API hello", body: "Posted through the API.", audience: { roles: ["leader"] } } });
  expect(ann.status(), await ann.text()).toBe(200);
  const res = await request.post("/api/v1/resources", { headers: H, data: { title: "API note", body: "Hello", category: "Guides" } });
  expect(res.status(), await res.text()).toBe(200);
  const [logged] = await sql`select count(*)::int as n from audit_log where action = 'api.request'`;
  expect(logged.n).toBeGreaterThanOrEqual(5);

  // Revoke → the key stops working immediately
  await admin.page.reload();
  await admin.page.getByRole("listitem").filter({ hasText: "E2E Claude" }).first().getByRole("button", { name: "Revoke" }).click();
  await admin.page.getByRole("button", { name: "Revoke key" }).click();
  await toast(admin.page, /revoked/);
  expect((await request.get("/api/v1", { headers: H })).status()).toBe(401);

  // Non-admins can't reach the API keys page
  const julia = await as(browser, "julia");
  await julia.page.goto("/settings/api-keys");
  await julia.page.waitForURL((u) => u.pathname === "/");
  await sql`delete from events where id = ${ev.id}`;
  await admin.ctx.close(); await julia.ctx.close();
});
