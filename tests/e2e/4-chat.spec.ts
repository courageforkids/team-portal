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
  await expect(david.page.getByText(/edit or unsend for 1[45] more minutes/)).toBeVisible();
  await david.page.getByRole("button", { name: "Unsend" }).click();
  await expect(david.page.locator(`[id^="m-"]`, { hasText: text })).toHaveCount(0);
  await expect(david.page.getByText("Message unsent").first()).toBeVisible();
  const isaacMsg = david.page.locator(`[id^="m-"]`, { hasText: "Packing day sign-ups are open" });
  await isaacMsg.getByRole("button", { name: "Message options" }).click();
  await david.page.getByRole("button", { name: "Report to an administrator" }).click();
  await david.page.getByRole("button", { name: "Send report" }).click();
  await toast(david.page, /administrator will take a look/);
  const [n] = await sql`select count(*)::int as n from notifications where type = 'chat_report'`;
  expect(n.n).toBeGreaterThan(0);
  await david.ctx.close();
});

test("stickers go in the message box, send bubble-free, and others see who's typing", async ({ browser }) => {
  const julia = await as(browser, "julia");
  const isaac = await as(browser, "isaac");
  for (const p of [julia.page, isaac.page]) { await p.goto("/messages"); await p.getByRole("link", { name: /Everyone/ }).first().click(); await p.waitForURL(/\/messages\/[0-9a-f-]{36}/); }

  // Typing indicator
  await julia.page.locator("#composer").pressSequentially("hello there", { delay: 30 });
  await expect(isaac.page.getByText("Julia is typing…")).toBeVisible({ timeout: 15_000 });

  // A pasted transparent image (what an Apple sticker is) sends right away as a sticker
  await julia.page.locator("#composer").evaluate(async (el) => {
    const c = document.createElement("canvas"); c.width = 120; c.height = 120;
    const ctx = c.getContext("2d")!; ctx.fillStyle = "#FED438"; ctx.beginPath(); ctx.arc(60, 60, 40, 0, Math.PI * 2); ctx.fill();
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
    const dt = new DataTransfer(); dt.items.add(new File([blob], "s.png", { type: "image/png" }));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  // It waits in the message box until Send is pressed, then goes out with the typed text
  await expect(julia.page.getByRole("img", { name: "Sticker preview" })).toBeVisible({ timeout: 15_000 });
  await julia.page.getByRole("button", { name: "Send" }).click();
  await expect(julia.page.getByRole("img", { name: "Sticker preview" })).toHaveCount(0);
  await expect(isaac.page.getByRole("img", { name: "Sticker" }).last()).toBeVisible({ timeout: 15_000 });
  await expect(isaac.page.getByText("hello there").last()).toBeVisible({ timeout: 15_000 });
});

test("members can rename a direct chat, and the menu shows live counts", async ({ browser, request }) => {
  const reese = await as(browser, "reese");
  await reese.page.goto("/messages");
  const [r] = await sql`select id from users where email = 'reese@demo.cfk.test'`;
  const [o] = await sql`select id from users where email = 'owen@demo.cfk.test'`;
  const key = [r.id, o.id].sort().join(":");
  let [c] = await sql`select id from conversations where dm_key = ${key}`;
  if (!c) {
    [c] = await sql`insert into conversations (kind, dm_key, created_by_id) values ('dm', ${key}, ${r.id}) returning id`;
    await sql`insert into conversation_members (conversation_id, user_id) values (${c.id}, ${r.id}), (${c.id}, ${o.id})`;
  }
  await reese.page.goto(`/messages/${c.id}`);
  await reese.page.getByRole("button", { name: "Chat details" }).click();
  await reese.page.getByRole("button", { name: "Rename chat" }).click();
  await reese.page.getByLabel("Chat name").fill("Box planning");
  await reese.page.getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => (await sql`select title from conversations where id = ${c.id}`)[0].title).toBe("Box planning");

  // Live menu counts
  const counts = await (await reese.page.request.get("/api/badges")).json();
  const [{ n }] = await sql`select count(*)::int as n from tasks t join task_assignees ta on ta.task_id = t.id where ta.user_id = ${r.id} and t.status in ('not_started','in_progress','revision_requested','blocked')`;
  expect(typeof counts.tasks).toBe("number");
  expect(counts.tasks).toBeGreaterThanOrEqual(Math.min(n, 1) ? 1 : 0);
  void request;
});

test("reactions and replies; messages show instantly", async ({ browser }) => {
  const [team] = await sql`select id from conversations where kind = 'team'`;
  const julia = await as(browser, "julia");
  const isaac = await as(browser, "isaac");
  await julia.page.goto(`/messages/${team.id}`);
  await isaac.page.goto(`/messages/${team.id}`);
  const text = `React to me ${Date.now()}`;
  await julia.page.locator("#composer").fill(text);
  await julia.page.getByRole("button", { name: "Send" }).click();
  await expect(julia.page.locator(`[id^="m-"]`, { hasText: text })).toBeVisible(); // appears right away
  const row = isaac.page.locator(`[id^="m-"]`, { hasText: text }).last();
  await expect(row).toBeVisible({ timeout: 15_000 });

  // Isaac reacts ❤️ from the message menu; Julia sees it live
  await row.getByRole("button", { name: "Message options" }).click();
  await isaac.page.getByRole("button", { name: "React ❤️" }).click();
  await expect(julia.page.locator(`[id^="m-"]`, { hasText: text }).last().getByRole("button", { name: /❤️ 1: Isaac/ })).toBeVisible({ timeout: 15_000 });

  // Isaac replies to it
  await row.getByRole("button", { name: "Message options" }).click();
  await isaac.page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(isaac.page.getByText(/Replying to Julia/)).toBeVisible();
  await isaac.page.locator("#composer").fill("Replying here");
  await isaac.page.getByRole("button", { name: "Send" }).click();
  const reply = julia.page.locator(`[id^="m-"]`, { hasText: "Replying here" }).last();
  await expect(reply).toBeVisible({ timeout: 15_000 });
  await expect(reply.getByText(text)).toBeVisible(); // quoted original
  const [m] = await sql`select reply_to_id from messages where body = 'Replying here' order by created_at desc limit 1`;
  expect(m.reply_to_id).toBeTruthy();
});

test("edit/unsend only for 15 minutes; @mentions; pins; search and jump to an old message", async ({ browser }) => {
  const [team] = await sql`select id from conversations where kind = 'team'`;
  const [david] = await sql`select id from users where email = 'david@demo.cfk.test'`;
  const [isaacU] = await sql`select id, name from users where email = 'isaac@demo.cfk.test'`;
  // An old message (30 days ago) buried under 60 newer ones, plus one of David's from 20 minutes ago.
  const word = `Zebrafish${Date.now()}`;
  await sql`insert into messages (conversation_id, author_id, body, created_at) values (${team.id}, ${david.id}, ${"Old note about " + word}, now() - interval '30 days')`;
  await sql`insert into messages (conversation_id, author_id, body, created_at) select ${team.id}, ${david.id}, 'filler ' || g, now() - interval '25 minutes' + g * interval '1 second' from generate_series(1, 60) g`;
  const stale = `Too late to change ${Date.now()}`;
  await sql`insert into messages (conversation_id, author_id, body, created_at) values (${team.id}, ${david.id}, ${stale}, now() - interval '20 minutes')`;
  await sql`update conversation_members set muted = true where conversation_id = ${team.id} and user_id = ${isaacU.id}`;
  await sql`update messages set pinned_at = null, pinned_by_id = null where conversation_id = ${team.id}`;

  const d = await as(browser, "david");
  await d.page.goto(`/messages/${team.id}`);
  // Past 15 minutes: no Edit or Unsend, and members can't pin in the team chat.
  await d.page.locator(`[id^="m-"]`, { hasText: stale }).getByRole("button", { name: "Message options" }).click();
  await expect(d.page.getByRole("button", { name: "Copy text" })).toBeVisible();
  await expect(d.page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(d.page.getByRole("button", { name: "Unsend" })).toHaveCount(0);
  await expect(d.page.getByRole("button", { name: /Pin to top/ })).toHaveCount(0);
  await d.page.keyboard.press("Escape");

  // @mention: typing "@Isa" offers Isaac; picking him inserts the handle. He's alerted even though he muted the chat.
  const first = isaacU.name.split(" ")[0];
  await d.page.locator("#composer").click();
  await d.page.keyboard.type("Can you grab boxes @Isa");
  await d.page.getByRole("option", { name: new RegExp(isaacU.name) }).click();
  await expect(d.page.locator("#composer")).toHaveText(new RegExp(`@${first}\\s*$`));
  await d.page.keyboard.type("please");
  await d.page.getByRole("button", { name: "Send" }).click();
  await expect.poll(async () => (await sql`select count(*)::int as n from notifications where user_id = ${isaacU.id} and type = 'chat_mention'`)[0].n, { timeout: 10_000 }).toBeGreaterThan(0);
  const [note] = await sql`select title, href from notifications where user_id = ${isaacU.id} and type = 'chat_mention' order by created_at desc limit 1`;
  expect(note.title).toMatch(/mentioned you in the team chat/);
  await sql`update conversation_members set muted = false where conversation_id = ${team.id} and user_id = ${isaacU.id}`;

  // Search finds the buried message and jumps to it.
  await d.page.getByRole("button", { name: "Search this chat" }).click();
  await d.page.getByRole("textbox", { name: "Search this chat" }).fill(word.slice(0, 12));
  await d.page.getByRole("listitem").filter({ hasText: word }).click();
  await expect(d.page.locator(`[id^="m-"]`, { hasText: word })).toBeInViewport({ timeout: 10_000 });

  // The admin pins it; everyone sees the banner, and tapping it goes there.
  const admin = await as(browser, "jacob");
  await admin.page.goto(`/messages/${team.id}`);
  const pinTarget = admin.page.locator(`[id^="m-"]`, { hasText: "Can you grab boxes" }).last();
  await pinTarget.getByRole("button", { name: "Message options" }).click();
  await admin.page.getByRole("button", { name: /Pin to top/ }).click();
  await expect(d.page.getByRole("button", { name: "Go to pinned message" })).toContainText("Can you grab boxes", { timeout: 15_000 });
  const isaac = await as(browser, "isaac");
  await isaac.page.goto(note.href);
  await expect(isaac.page.getByRole("button", { name: "Go to pinned message" })).toBeVisible();
  await expect(isaac.page.locator(`[id^="m-"]`, { hasText: "Can you grab boxes" }).last().locator("span.font-semibold", { hasText: `@${first}` })).toBeVisible();
  await admin.page.getByRole("button", { name: /^(Pinned|\d+ pinned)$/ }).click();
  await admin.page.getByRole("button", { name: /Unpin message/ }).click();
  await expect(d.page.getByRole("button", { name: "Go to pinned message" })).toHaveCount(0, { timeout: 15_000 });
  await d.ctx.close(); await admin.ctx.close(); await isaac.ctx.close();
});
