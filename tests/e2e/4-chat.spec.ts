import { test, expect } from "@playwright/test";
import { as, sql, toast } from "./helpers";

test("team chat: a message from one member shows up live for another", async ({ browser }) => {
  const julia = await as(browser, "julia");
  const isaac = await as(browser, "isaac");
  const [team] = await sql`select id from conversations where kind = 'team'`;
  await isaac.page.goto(`/messages/${team.id}`);
  const text = `Live test ${Date.now()}`;
  await julia.page.goto(`/messages/${team.id}`);
  await julia.page.fill("#composer", text);
  await julia.page.getByRole("button", { name: "Send" }).click();
  await expect(julia.page.locator(`[id^="m-"]`, { hasText: text })).toBeVisible();
  await expect(isaac.page.locator(`[id^="m-"]`, { hasText: text })).toBeVisible({ timeout: 10_000 }); // arrives by polling, no reload
  await julia.ctx.close(); await isaac.ctx.close();
});

test("direct messages and group chats", async ({ browser }) => {
  const reese = await as(browser, "reese");
  await reese.page.goto("/messages");
  await reese.page.getByRole("button", { name: "New" }).click();
  await reese.page.getByRole("dialog").getByText("Owen", { exact: true }).click();
  await reese.page.getByRole("button", { name: "Start chat" }).click();
  await reese.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
  await reese.page.fill("#composer", "Hi Owen!");
  await reese.page.getByRole("button", { name: "Send" }).click();
  await expect(reese.page.locator(`[id^="m-"]`, { hasText: "Hi Owen!" }).last()).toBeVisible();
  // Starting the same DM again reuses it
  const firstUrl = reese.page.url();
  await reese.page.goto("/messages");
  await reese.page.getByRole("button", { name: "New" }).click();
  await reese.page.getByRole("dialog").getByText("Owen", { exact: true }).click();
  await reese.page.getByRole("button", { name: "Start chat" }).click();
  await reese.page.waitForURL(firstUrl);
  // Group chat with a name
  await reese.page.goto("/messages");
  await reese.page.getByRole("button", { name: "New" }).click();
  const dlg = reese.page.getByRole("dialog");
  await dlg.getByText("Owen", { exact: true }).click();
  await dlg.getByText("David", { exact: true }).click();
  await reese.page.fill("#gc-title", "Box decorating");
  await reese.page.getByRole("button", { name: /Start group chat/ }).click();
  await reese.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
  await expect(reese.page.getByText("Box decorating").first()).toBeVisible();
  await reese.ctx.close();
});

test("work pairs: admin creates a pair, assigns a task, and outsiders can't read it", async ({ browser }) => {
  const admin = await as(browser, "jacob");
  const name = `Pair ${Date.now()}`;
  await admin.page.goto("/messages");
  await admin.page.getByRole("button", { name: /Work group/ }).click();
  await admin.page.fill("#wg-title", name);
  const dlg = admin.page.getByRole("dialog");
  await dlg.getByText("Arleigh", { exact: true }).click();
  await dlg.getByText("Owen", { exact: true }).click();
  await admin.page.getByRole("button", { name: "Create work group" }).click();
  await admin.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
  const groupId = admin.page.url().split("/").pop()!;
  const members = await sql`select u.name from conversation_members m join users u on u.id = m.user_id where m.conversation_id = ${groupId} order by u.name`;
  expect(members.map((m) => m.name)).toEqual(["Arleigh", "Owen"]); // a real pair: the admin isn't added
  await expect(admin.page.getByText(/viewing this chat as an administrator/)).toBeVisible(); // admin oversight is read-only

  // Assign one shared task to the pair from the New task form
  await admin.page.goto(`/tasks/new?workGroupId=${groupId}`);
  await admin.page.fill("#title", `${name} task`);
  await admin.page.getByRole("button", { name: "Create & assign" }).click();
  await admin.page.waitForURL(/\/tasks\/[0-9a-f-]{36}$/);
  const taskId = admin.page.url().split("/").pop()!;
  const assignees = await sql`select u.name from task_assignees a join users u on u.id = a.user_id where a.task_id = ${taskId} order by u.name`;
  expect(assignees.map((a) => a.name)).toEqual(["Arleigh", "Owen"]);

  // The pair sees the task in their chat and can talk
  const owen = await as(browser, "owen");
  await owen.page.goto(`/messages/${groupId}`);
  await expect(owen.page.getByRole("link", { name: `${name} task`, exact: true })).toBeVisible();
  await owen.page.fill("#composer", "Let's split it up");
  await owen.page.getByRole("button", { name: "Send" }).click();
  await expect(owen.page.locator(`[id^="m-"]`, { hasText: "Let's split it up" }).last()).toBeVisible();

  // Someone outside the pair can't read it, in the page or the API
  const sam = await as(browser, "sam");
  await sam.page.goto(`/messages/${groupId}`);
  await expect(sam.page.getByText("We couldn't find that page")).toBeVisible();
  expect((await sam.page.request.get(`/api/chat/${groupId}`)).status()).toBe(404);
  await admin.ctx.close(); await owen.ctx.close(); await sam.ctx.close();
});

test("members can delete their own messages and report others'", async ({ browser }) => {
  const [team] = await sql`select id from conversations where kind = 'team'`;
  const david = await as(browser, "david");
  await david.page.goto(`/messages/${team.id}`);
  const text = `Oops ${Date.now()}`;
  await david.page.fill("#composer", text);
  await david.page.getByRole("button", { name: "Send" }).click();
  const bubble = david.page.locator(`[id^="m-"]`, { hasText: text });
  await bubble.getByRole("button", { name: "Message options" }).click();
  await david.page.getByRole("button", { name: "Delete" }).click();
  await expect(david.page.locator(`[id^="m-"]`, { hasText: text })).toHaveCount(0);
  const isaacMsg = david.page.locator(`[id^="m-"]`, { hasText: "Packing day sign-ups are open" });
  await isaacMsg.getByRole("button", { name: "Message options" }).click();
  await david.page.getByRole("button", { name: "Report to an administrator" }).click();
  await david.page.getByRole("button", { name: "Send report" }).click();
  await toast(david.page, /administrator will take a look/);
  const [n] = await sql`select count(*)::int as n from notifications where type = 'chat_report'`;
  expect(n.n).toBeGreaterThan(0);
  await david.ctx.close();
});
