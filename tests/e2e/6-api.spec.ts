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

test("task drafts stay private until an admin publishes them", async ({ browser, request }) => {
  const admin = await as(browser, "jacob");
  await admin.page.goto("/settings/api-keys");
  await admin.page.fill("#ak-name", "E2E drafts");
  await admin.page.getByRole("button", { name: "Create key" }).click();
  const key = await admin.page.getByTestId("copy-value").inputValue();
  const H = { Authorization: `Bearer ${key}` };
  const title = `Draft task ${Date.now()}`;
  const [owen] = await sql`select id from users where email = 'owen@demo.cfk.test'`;
  const before = (await sql`select count(*)::int as n from notifications where user_id = ${owen.id}`)[0].n;
  const r = await request.post("/api/v1/tasks", { headers: H, data: { title, assignees: ["Owen"], dueAt: "2026-12-20T17:00", draft: true, batch: "E2E week" } });
  expect(r.status(), await r.text()).toBe(200);
  expect((await r.json()).draft).toBe(true);
  expect((await sql`select count(*)::int as n from tasks where title = ${title}`)[0].n).toBe(0);
  expect((await sql`select count(*)::int as n from notifications where user_id = ${owen.id}`)[0].n).toBe(before);

  await admin.page.goto("/tasks/drafts");
  const card = admin.page.getByRole("listitem").filter({ hasText: title });
  await expect(card).toBeVisible();
  admin.page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Publish" }).click();
  await toast(admin.page, /Published 1 draft/);
  await expect.poll(async () => (await sql`select count(*)::int as n from tasks where title = ${title}`)[0].n).toBe(1);
  expect((await sql`select count(*)::int as n from notifications where user_id = ${owen.id}`)[0].n).toBeGreaterThan(before);
  expect((await sql`select count(*)::int as n from task_drafts where batch = 'E2E week'`)[0].n).toBe(0);
});

test("drafts everywhere: announcement drafts from the API and the portal stay private until published", async ({ browser, request }) => {
  const admin = await as(browser, "jacob");
  await admin.page.goto("/settings/api-keys");
  await admin.page.fill("#ak-name", "E2E drafts 2");
  await admin.page.getByRole("button", { name: "Create key" }).click();
  const key = await admin.page.getByTestId("copy-value").inputValue();
  const t1 = `API draft ann ${Date.now()}`;
  const r = await request.post("/api/v1/announcements", { headers: { Authorization: `Bearer ${key}` }, data: { title: t1, body: "Hello team", draft: true } });
  expect(r.status(), await r.text()).toBe(200);
  expect((await sql`select count(*)::int as n from announcements where title = ${t1}`)[0].n).toBe(0);

  // Portal form "Save as draft"
  const t2 = `Form draft ann ${Date.now()}`;
  await admin.page.goto("/announcements/new");
  await admin.page.fill("#title", t2);
  await admin.page.fill("#body", "Drafted in the portal");
  await admin.page.getByRole("button", { name: "Save as draft" }).click();
  await admin.page.waitForURL(/\/drafts$/);
  expect((await sql`select count(*)::int as n from announcements where title = ${t2}`)[0].n).toBe(0);
  await expect(admin.page.getByText(t1)).toBeVisible();
  await expect(admin.page.getByText(t2)).toBeVisible();

  // Julia can't see the drafts page
  const julia = await as(browser, "julia");
  await julia.page.goto("/drafts");
  await expect(julia.page).not.toHaveURL(/\/drafts$/);

  for (const t of [t1, t2]) {
    admin.page.once("dialog", (d) => d.accept());
    await admin.page.getByRole("listitem").filter({ hasText: t }).getByRole("button", { name: "Publish" }).click();
    await toast(admin.page, /Published 1 draft/);
    await expect.poll(async () => (await sql`select count(*)::int as n from announcements where title = ${t}`)[0].n).toBe(1);
  }
});

test("drafts can be edited before publishing", async ({ browser, request }) => {
  const admin = await as(browser, "jacob");
  await admin.page.goto("/settings/api-keys");
  await admin.page.fill("#ak-name", "E2E drafts 3");
  await admin.page.getByRole("button", { name: "Create key" }).click();
  const key = await admin.page.getByTestId("copy-value").inputValue();
  const H = { Authorization: `Bearer ${key}` };
  const t = `Editable ${Date.now()}`;
  await request.post("/api/v1/tasks", { headers: H, data: { title: t, assignees: ["Owen"], dueAt: "2026-12-20T17:00", submissionTypes: ["checklist"], checklist: ["Step one"], draft: true } });
  await request.post("/api/v1/polls", { headers: H, data: { question: `Poll ${t}`, options: ["A", "B"], draft: true } });

  await admin.page.goto("/drafts");
  await admin.page.getByRole("button", { name: `Edit draft ${t}` }).click();
  const dlg = admin.page.getByRole("dialog").filter({ hasText: "Edit draft" });
  await dlg.getByLabel("Title").fill(`${t} (edited)`);
  await dlg.getByLabel("Checklist").fill("Step one\nStep two");
  await dlg.getByRole("checkbox", { name: "Isaac" }).check();
  await dlg.getByRole("button", { name: "Save draft" }).click();
  await toast(admin.page, /Draft updated/);
  const [d] = await sql`select title, assignee_ids, input from task_drafts where title = ${t + " (edited)"}`;
  expect(d.assignee_ids).toHaveLength(2);
  expect(d.input.checklist.map((c: { label: string }) => c.label)).toEqual(["Step one", "Step two"]);

  await admin.page.getByRole("button", { name: `Edit draft Poll ${t}` }).click();
  const pd = admin.page.getByRole("dialog").filter({ hasText: "Edit draft" });
  await pd.getByLabel("Options").fill("A\nB\nC");
  await pd.getByRole("button", { name: "Save draft" }).click();
  await toast(admin.page, /Draft updated/);

  admin.page.once("dialog", (x) => x.accept());
  await admin.page.getByRole("listitem").filter({ hasText: `${t} (edited)` }).getByRole("button", { name: "Publish" }).click();
  await toast(admin.page, /Published 1 draft/);
  await expect.poll(async () => (await sql`select count(*)::int as n from tasks where title = ${t + " (edited)"}`)[0].n).toBe(2);
  admin.page.once("dialog", (x) => x.accept());
  await admin.page.getByRole("listitem").filter({ hasText: `Poll ${t}` }).getByRole("button", { name: "Publish" }).click();
  await toast(admin.page, /Published 1 draft/);
  const [p] = await sql`select options from polls where question = ${"Poll " + t}`;
  expect(p.options).toHaveLength(3);
});
