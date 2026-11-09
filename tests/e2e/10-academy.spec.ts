import { test, expect, type Page } from "@playwright/test";
import { as, sql, toast } from "./helpers";

const acceptDialogs = (p: Page) => p.on("dialog", (d) => void d.accept());

test("the Academy and the Christmas look are on for everyone", async ({ browser }) => {
  const isaac = await as(browser, "isaac");
  await isaac.page.goto("/");
  await expect(isaac.page.getByRole("link", { name: "Courage Academy" }).first()).toBeAttached();
  await isaac.page.goto("/academy");
  await expect(isaac.page.getByText("The Cape Cup")).toBeVisible();
  const md = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).slice(5);
  if (md >= "11-01" || md <= "01-01") {
    await isaac.page.goto("/");
    await expect(isaac.page.locator("[data-holiday]")).toHaveCount(1);
    await expect(isaac.page.getByText(/until Christmas|Christmas Day|Happy holidays/)).toBeVisible();
    await isaac.page.getByRole("button", { name: "Turn off snow & lights" }).click();
    await expect(isaac.page.locator(".cfk-lights")).toBeHidden();
  }
  await isaac.ctx.close();
});

test("the Sorting gives a Cape, joins the Cape chat, and the hero becomes the profile picture", async ({ browser }) => {
  await sql`update users set cape = null, sorted_at = null, hero = null, hero_avatar = false where email = 'sam@demo.cfk.test'`;
  const sam = await as(browser, "sam");
  await sam.page.goto("/");
  const dlg = sam.page.getByRole("dialog", { name: "The Sorting" });
  await dlg.getByRole("button", { name: "Find my cape" }).click();
  for (let i = 0; i < 6; i++) await dlg.locator("button.rounded-xl").first().click();
  await expect(dlg.getByText("Welcome to the")).toBeVisible({ timeout: 15_000 });
  await dlg.getByRole("link", { name: /Create my hero/ }).click();
  await expect(sam.page).toHaveURL(/\/academy\/hero/);
  const [u] = await sql`select id, cape from users where email = 'sam@demo.cfk.test'`;
  expect(["navy", "gold"]).toContain(u.cape);
  const [chat] = await sql`select c.id from conversations c join conversation_members m on m.conversation_id = c.id where c.dm_key = ${"cape:" + u.cape} and m.user_id = ${u.id}`;
  expect(chat).toBeTruthy();

  await sam.page.getByRole("tab", { name: "Hair" }).click();
  await sam.page.getByRole("button", { name: "Afro", exact: true }).click();
  await sam.page.getByRole("tab", { name: "Pose & scene" }).click();
  await sam.page.getByRole("button", { name: /Flying/i }).first().click();
  await sam.page.getByLabel("Use as my profile picture").check();
  await sam.page.getByRole("button", { name: "Save" }).click();
  await toast(sam.page, /Hero saved/);
  const [after] = await sql`select hero, hero_avatar, avatar_file_id from users where id = ${u.id}`;
  expect(after.hero.hair).toBe("afro");
  expect(after.hero_avatar).toBe(true);
  const res = await sam.page.request.get(`/api/files/${after.avatar_file_id}?inline=1`);
  expect(res.headers()["content-type"]).toBe("image/png"); // drawn on the device, so it shows like a normal photo on every phone
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("inline");
  expect(await res.text()).not.toContain("<script");
  // Switching back restores the photo slot.
  await sam.page.getByLabel("Use as my profile picture").uncheck();
  await sam.page.getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => (await sql`select hero_avatar from users where id = ${u.id}`)[0].hero_avatar).toBe(false);
  await sam.ctx.close();
});

test("paper planes with stickers land in the scrapbook and on the Plane Board; spells work", async ({ browser }) => {
  const [owen] = await sql`select id from users where email = 'owen@demo.cfk.test'`;
  await sql`delete from paper_planes where to_id = ${owen.id}`;
  const julia = await as(browser, "julia");
  await julia.page.goto("/academy");
  await julia.page.getByRole("button", { name: "Throw a paper plane" }).first().click();
  const d = julia.page.getByRole("dialog").filter({ hasText: "A quick note that flies" });
  await d.locator("#pl-to").selectOption({ label: "Owen" });
  await d.getByText("You crushed it").click();
  await d.locator("#pl-msg").fill("Great graphics today!");
  await d.getByRole("button", { name: "Sticker 🎉" }).click();
  await d.getByLabel(/Post it on the Plane Board/).check();
  await d.getByRole("button", { name: "Throw it" }).click();
  await toast(julia.page, /flying to Owen/);

  const o = await as(browser, "owen");
  await o.page.goto("/");
  await o.page.getByRole("button", { name: /Paper plane from Julia/ }).click();
  const caught = o.page.getByRole("dialog", { name: /Paper plane from Julia/ });
  await expect(caught.getByText("Great graphics today!")).toBeVisible();
  await expect(caught.getByText("🎉")).toBeVisible();
  await o.page.getByRole("button", { name: /Keep it/ }).click();
  await o.page.goto("/academy/scrapbook");
  await expect(o.page.getByText("Great graphics today!")).toBeVisible();
  await o.page.goto("/academy");
  await o.page.getByRole("button", { name: "Heart this plane" }).first().click();
  await expect.poll(async () => (await sql`select count(*)::int as n from plane_hearts h join paper_planes p on p.id = h.plane_id where p.to_id = ${owen.id}`)[0].n).toBe(1);

  await julia.page.goto("/messages");
  await julia.page.getByRole("link", { name: /Everyone/ }).first().click();
  await julia.page.locator("#composer").fill("/snow");
  await julia.page.getByRole("button", { name: "Send" }).click();
  await expect(julia.page.getByText("You cast Let It Snow").last()).toBeVisible();
  await julia.ctx.close(); await o.ctx.close();
});

test("missions, weekly challenges, captains and common rooms", async ({ browser }) => {
  test.setTimeout(120_000);
  await sql`delete from academy_claims`; await sql`delete from academy_challenges`; await sql`delete from cape_bonuses where source in ('challenge', 'mission')`; await sql`delete from cape_board_notes`; await sql`delete from cape_mottos`;
  const david = await as(browser, "david");
  await david.page.goto("/academy");
  await david.page.locator("#mc-kind").selectOption("press");
  await david.page.locator("#mc-det").fill("The Spartanburg Herald is writing about our boxes");
  await david.page.getByRole("button", { name: "Claim points" }).click();
  await toast(david.page, /Claim sent/);

  const jacob = await as(browser, "jacob");
  acceptDialogs(jacob.page);
  await jacob.page.goto("/academy/admin");
  await jacob.page.getByRole("button", { name: "Approve" }).click();
  await toast(jacob.page, /Approved: \+20/);
  const [m] = await sql`select b.points from cape_bonuses b join users u on u.id = b.user_id where u.email = 'david@demo.cfk.test' and b.source = 'mission'`;
  expect(m.points).toBe(20);

  await jacob.page.locator("#ch-title").fill("Most story shares");
  await jacob.page.getByRole("button", { name: "Post challenge" }).click();
  await toast(jacob.page, /Challenge posted/);
  const julia = await as(browser, "julia");
  await julia.page.goto("/academy");
  await expect(julia.page.getByText("Most story shares")).toBeVisible();
  await jacob.page.getByRole("button", { name: /Gold Cape won/ }).click();
  await toast(jacob.page, /wins! \+10/);
  expect((await sql`select count(*)::int as n from cape_bonuses where source = 'challenge' and cape = 'gold'`)[0].n).toBe(1);

  // Make Julia the Gold captain; she pins a note, gives a bonus and suggests a motto.
  await jacob.page.locator("#cap-gold").selectOption({ label: "Julia" });
  await jacob.page.locator("form").filter({ has: jacob.page.locator("#cap-gold") }).getByRole("button", { name: "Set" }).click();
  await toast(jacob.page, /Captain set/);
  await julia.page.goto("/academy/capes/gold");
  await expect(julia.page.getByRole("heading", { name: /Captain tools/ })).toBeVisible();
  await julia.page.getByLabel("New board note").fill("Bake sale planning Thursday!");
  await julia.page.getByRole("button", { name: /Pin note/ }).click();
  await expect(julia.page.getByText("Bake sale planning Thursday!")).toBeVisible();
  await julia.page.locator("#cb-to").selectOption({ label: "Reese" });
  await julia.page.locator("#cb-why").fill("Great flyer");
  await julia.page.getByRole("button", { name: "Give", exact: true }).click();
  await toast(julia.page, /\+2 sent/);
  await julia.page.getByLabel("Suggest a motto").fill("Golden hearts, golden hands");
  await julia.page.getByRole("button", { name: "Add", exact: true }).click();
  await toast(julia.page, /Motto added/);
  await expect(julia.page.getByText(/Golden hearts, golden hands/).first()).toBeVisible();

  // A Navy member can visit but not read the board.
  const isaac = await as(browser, "isaac");
  await isaac.page.goto("/academy/capes/gold");
  await expect(isaac.page.getByText(/You're visiting/)).toBeVisible();
  await expect(isaac.page.getByText("Bake sale planning Thursday!")).toHaveCount(0);
  await david.ctx.close(); await jacob.ctx.close(); await julia.ctx.close(); await isaac.ctx.close();
});

test("trivia: a duel, the question of the day and a live trivia night", async ({ browser }) => {
  test.setTimeout(180_000);
  await sql`delete from trivia_duels`; await sql`delete from trivia_nights`; await sql`delete from trivia_daily_answers`;
  const play = async (p: Page) => {
    await p.getByRole("button", { name: "I'm ready" }).click();
    for (let i = 0; i < 5; i++) {
      await expect(p.getByText(`Question ${i + 1} of 5`)).toBeVisible({ timeout: 15_000 });
      await p.getByRole("button", { name: /^A / }).click();
    }
  };
  const julia = await as(browser, "julia");
  await julia.page.goto("/academy/trivia");
  await julia.page.getByRole("button", { name: "Challenge someone" }).click();
  await julia.page.locator("#du-to").selectOption({ label: "Reese" });
  await julia.page.getByRole("button", { name: "Start duel" }).click();
  await expect(julia.page).toHaveURL(/\/academy\/trivia\/duel\//);
  await play(julia.page);
  await expect(julia.page.getByText(/Waiting for Reese/)).toBeVisible({ timeout: 15_000 });

  const reese = await as(browser, "reese");
  await reese.page.goto("/academy/trivia");
  await reese.page.getByRole("link", { name: "Play" }).click();
  await play(reese.page);
  await expect(reese.page.getByText(/You won!|won this one|It's a tie!/)).toBeVisible({ timeout: 15_000 });
  expect((await sql`select status from trivia_duels`)[0].status).toBe("done");

  // Question of the day
  const isaac = await as(browser, "isaac");
  await isaac.page.goto("/academy");
  await isaac.page.getByRole("button", { name: /^A / }).first().click();
  await expect(isaac.page.getByText(/Correct! \+2|Not this time/)).toBeVisible();

  // Trivia night: Jacob hosts, Isaac plays.
  const jacob = await as(browser, "jacob");
  acceptDialogs(jacob.page);
  await jacob.page.goto("/academy/admin");
  await jacob.page.locator("#tn-n").fill("5");
  await jacob.page.getByRole("button", { name: "Set up" }).click();
  await expect(jacob.page.getByRole("link", { name: /open the host screen/ })).toBeVisible();
  await jacob.page.goto("/academy/trivia/night");
  await isaac.page.goto("/academy/trivia/night");
  await jacob.page.getByRole("button", { name: "Start" }).click();
  await expect(isaac.page.getByText("Question 1 of 5")).toBeVisible({ timeout: 10_000 });
  await isaac.page.getByRole("button", { name: /^A / }).click();
  await expect.poll(async () => (await sql`select count(*)::int as n from trivia_night_answers`)[0].n).toBe(1);
  for (let i = 0; i < 4; i++) { await jacob.page.getByRole("button", { name: "Next question" }).click(); await expect(jacob.page.getByText(`Question ${i + 2} of 5`)).toBeVisible({ timeout: 10_000 }); }
  await jacob.page.getByRole("button", { name: /Finish & crown/ }).click();
  await expect.poll(async () => (await sql`select status from trivia_nights`)[0].status).toBe("done");
  await julia.ctx.close(); await reese.ctx.close(); await isaac.ctx.close(); await jacob.ctx.close();
});
