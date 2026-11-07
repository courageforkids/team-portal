/**
 * DEMO DATA ONLY — fictional emails, sample tasks. Never run against production.
 * Usage: npm run seed:demo   (wipes the database first)
 */
import { sql } from "drizzle-orm";
import { connect, DEPARTMENTS, CATEGORIES } from "./lib";
import * as s from "../src/db/schema";
import { hashPassword } from "../src/server/crypto";

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "CourageDemo2026!";
const H = 3600_000, D = 24 * H;

async function main() {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEMO_SEED) throw new Error("Refusing to seed demo data in production.");
  const { db, close } = connect();
  await db.execute(sql`truncate table shoutout_cheers, shoutout_recipients, shoutouts, poll_votes, polls, meeting_attendance, meetings, api_keys, volunteer_hours, shift_signups, event_shifts, messages, conversation_members, conversations, push_subscriptions, audit_log, notifications, email_outbox, announcement_reads, announcements, events, resources,
    accountability_records, extension_requests, task_events, task_comments, reviews, submissions, task_assignees, tasks, task_series,
    milestones, projects, files, task_categories, password_resets, invitations, sessions, rate_limits, users, departments, settings cascade`);

  const depts = await db.insert(s.departments).values([...DEPARTMENTS]).returning();
  const dep = (slug: string) => depts.find((d) => d.slug === slug)!.id;
  const cats = await db.insert(s.taskCategories).values(CATEGORIES).returning();
  const cat = (n: string) => cats.find((c) => c.name === n)!.id;
  await db.insert(s.settings).values({ id: 1, data: {
    orgName: "Courage for Kids", tagline: "Their fight. Our mission.", reminderHours: [48, 24], overdueReminders: true,
    emailEnabled: false, emailFrom: "", quietHoursStart: 21, quietHoursEnd: 7, timezone: "America/New_York",
  } });

  const pw = await hashPassword(DEMO_PASSWORD);
  const people = [
    { key: "jacob", name: "Jacob Rogers", title: "Founder & Executive Director", role: "admin", dept: "executive", resp: "Sets direction, manages partnerships, assigns and reviews work." },
    { key: "julia", name: "Julia", title: "Fundraising Director", role: "leader", dept: "fundraising", resp: "Leads donation drives, sponsor outreach and fundraising events." },
    { key: "isaac", name: "Isaac", title: "Volunteer Coordinator", role: "leader", dept: "volunteers", resp: "Recruits and schedules volunteers; runs packing-day sign-ups." },
    { key: "reese", name: "Reese", title: "Patient Interaction Coordinator", role: "leader", dept: "patient-interaction", resp: "Coordinates with hospital child-life teams; plans age-appropriate box contents." },
    { key: "david", name: "David", title: "Director of Logistics & Outreach", role: "leader", dept: "logistics", resp: "Manages inventory, packing and community outreach." },
    { key: "arleigh", name: "Arleigh", title: "Director of Media", role: "leader", dept: "media", resp: "Runs Instagram, photography and graphics." },
    { key: "owen", name: "Owen", title: "Creative Engagement Coordinator", role: "leader", dept: "creative", resp: "Creates engagement ideas, card-making activities and campaign concepts." },
    { key: "dominik", name: "Dominik", title: "Director of Initiatives", role: "leader", dept: "initiatives", resp: "Leads new programs and special initiatives from idea to launch." },
    { key: "sam", name: "Sam Demo", title: "Volunteer", role: "volunteer", dept: "volunteers", resp: "Helps at packing days and events." },
  ] as const;
  const U: Record<string, string> = {};
  for (const p of people) {
    const [u] = await db.insert(s.users).values({
      email: `${p.key}@demo.cfk.test`, name: p.name, title: p.title, role: p.role, departmentId: dep(p.dept), passwordHash: pw, responsibilities: p.resp,
      onboardedAt: p.key === "jacob" ? new Date() : null,
    }).returning();
    U[p.key] = u.id;
  }
  for (const [slug, k] of [["executive", "jacob"], ["fundraising", "julia"], ["volunteers", "isaac"], ["patient-interaction", "reese"], ["logistics", "david"], ["media", "arleigh"], ["creative", "owen"], ["initiatives", "dominik"]] as const)
    await db.execute(sql`update departments set lead_id = ${U[k]} where slug = ${slug}`);

  const now = Date.now();
  const proj = await db.insert(s.projects).values([
    { name: "Courage Box Distribution", description: "Pack and deliver Courage Boxes to partner hospitals.", directorId: U.david, departmentId: dep("logistics"), status: "active" },
    { name: "Holiday Fundraising Campaign", description: "Holiday season giving push, sample goals.", directorId: U.julia, departmentId: dep("fundraising"), status: "active" },
    { name: "Hospital Outreach", description: "Build relationships with new hospital partners.", directorId: U.reese, departmentId: dep("patient-interaction"), status: "active" },
    { name: "Social Media Campaigns", description: "Plan and publish posts that tell our story.", directorId: U.arleigh, departmentId: dep("media"), status: "active" },
    { name: "Volunteer Recruitment", description: "Grow the volunteer team for packing days.", directorId: U.isaac, departmentId: dep("volunteers"), status: "planning" },
    { name: "Community Events", description: "Booths and stands at local community events.", directorId: U.owen, departmentId: dep("creative"), status: "planning" },
  ]).returning();
  const P = (n: string) => proj.find((p) => p.name === n)!.id;
  await db.insert(s.milestones).values([
    { projectId: P("Courage Box Distribution"), title: "Inventory counted", position: 0, completedAt: new Date(now - 5 * D) },
    { projectId: P("Courage Box Distribution"), title: "Boxes packed", position: 1 },
    { projectId: P("Courage Box Distribution"), title: "Boxes shipped", position: 2 },
    { projectId: P("Holiday Fundraising Campaign"), title: "Campaign plan approved", position: 0, completedAt: new Date(now - 2 * D) },
    { projectId: P("Holiday Fundraising Campaign"), title: "Sponsor asks sent", position: 1 },
  ]);

  type T = Partial<typeof s.tasks.$inferInsert> & { title: string; who: string[]; subs?: number };
  const base = { timezone: "America/New_York", submissionTypes: ["text"] as s.SubmissionType[] };
  const list: T[] = [
    { title: "Design three Instagram graphics for the holiday campaign", who: ["arleigh"], departmentId: dep("media"), categoryId: cat("Social media"), projectId: P("Social Media Campaigns"), priority: "high", status: "in_progress", dueAt: new Date(now + 2 * D), deliverables: "Three square graphics (1080×1080) in our navy and yellow.", completionCriteria: "On-brand, readable on a phone, no patient photos.", submissionTypes: ["file", "text"], instructions: "Use the brand kit in Resources. One post each for: what a Courage Box is, how to donate, and a thank-you to sponsors." },
    { title: "Draft sponsor thank-you list (sample)", who: ["julia"], departmentId: dep("fundraising"), categoryId: cat("Fundraising"), projectId: P("Holiday Fundraising Campaign"), priority: "medium", status: "submitted", dueAt: new Date(now + 1 * D), subs: 1, instructions: "List the sample sponsors and what each gave." },
    { title: "Confirm packing-day volunteer sign-ups", who: ["isaac"], departmentId: dep("volunteers"), categoryId: cat("Courage Boxes"), projectId: P("Volunteer Recruitment"), priority: "high", status: "not_started", dueAt: new Date(now - 1 * D), instructions: "Message everyone on the sign-up sheet and confirm attendance.", submissionTypes: ["checklist"], checklist: [{ id: "a", label: "Messaged every volunteer" }, { id: "b", label: "Updated the sign-up sheet" }, { id: "c", label: "Shared the final count" }] },
    { title: "Inventory count before packing", who: ["david"], departmentId: dep("logistics"), categoryId: cat("Courage Boxes"), projectId: P("Courage Box Distribution"), priority: "urgent", status: "revision_requested", dueAt: new Date(now + 3 * D), subs: 1, submissionTypes: ["file", "text"], instructions: "Count every item category and upload the spreadsheet." },
    { title: "Age-group content guide for box packing", who: ["reese"], departmentId: dep("patient-interaction"), projectId: P("Hospital Outreach"), priority: "medium", status: "approved", dueAt: new Date(now - 4 * D), subs: 1, completedAt: new Date(now - 3 * D), firstSubmittedAt: new Date(now - 5 * D) },
    { title: "Pitch two creative engagement ideas", who: ["owen"], departmentId: dep("creative"), categoryId: cat("Events"), projectId: P("Community Events"), priority: "low", status: "not_started", dueAt: new Date(now + 6 * D), submissionTypes: ["text", "link"] },
    { title: "Outline the first new initiative", who: ["dominik"], departmentId: dep("initiatives"), priority: "medium", status: "in_progress", dueAt: new Date(now + 5 * D), instructions: "One page: the problem, who it helps, what it needs, and a first step." },
    { title: "Research two new hospital partners", who: ["reese", "david"], departmentId: dep("patient-interaction"), categoryId: cat("Outreach"), projectId: P("Hospital Outreach"), priority: "medium", status: "blocked", blockedReason: "Waiting on contact info from the child-life office.", statusBeforeBlock: "in_progress", dueAt: new Date(now + 8 * D) },
    { title: "Help set up the packing tables", who: ["sam"], departmentId: dep("volunteers"), priority: "low", status: "not_started", dueAt: new Date(now + 4 * D), submissionTypes: ["checklist"], checklist: [{ id: "a", label: "Tables set up" }, { id: "b", label: "Supplies sorted by age group" }] },
    { title: "Post packing-day recap", who: ["arleigh"], departmentId: dep("media"), categoryId: cat("Social media"), priority: "medium", status: "approved", dueAt: new Date(now - 9 * D), subs: 1, completedAt: new Date(now - 9 * D), firstSubmittedAt: new Date(now - 10 * D), submissionTypes: ["link"] },
  ];
  for (const t of list) {
    const { who, subs, ...rest } = t;
    const [row] = await db.insert(s.tasks).values({ ...base, ...rest, originalDueAt: rest.dueAt, reviewerId: U.jacob, createdById: U.jacob,
      firstSubmittedAt: rest.firstSubmittedAt ?? (subs ? new Date(now - 6 * H) : null) }).returning();
    await db.insert(s.taskAssignees).values(who.map((k) => ({ taskId: row.id, userId: U[k] })));
    await db.insert(s.taskEvents).values({ taskId: row.id, actorId: U.jacob, kind: "created", detail: {} });
    if (subs) {
      const [sub] = await db.insert(s.submissions).values({ taskId: row.id, version: 1, submittedById: U[who[0]], text: "Sample submission text for the demo.", note: "Let me know what you think!", submittedAt: row.firstSubmittedAt ?? new Date(now - 6 * H), dueAtSubmission: row.dueAt }).returning();
      if (row.status === "approved") await db.insert(s.reviews).values({ taskId: row.id, submissionId: sub.id, reviewerId: U.jacob, decision: "approved", feedback: "Great work — thank you!" });
      if (row.status === "revision_requested") await db.insert(s.reviews).values({ taskId: row.id, submissionId: sub.id, reviewerId: U.jacob, decision: "revision_requested", feedback: "Can you split the counts by age group?" });
    }
  }
  await db.insert(s.taskSeries).values({
    recurrence: "weekly", nextDueAt: new Date(now + 9 * D), leadDays: 5, assigneeIds: [U.julia, U.isaac, U.reese, U.david, U.arleigh, U.owen, U.dominik], createdById: U.jacob,
    template: { title: "Weekly department update", instructions: "Three bullets: what you finished, what's next, and anything you're stuck on.", departmentId: null, categoryId: cat("Admin"), projectId: null,
      priority: "medium", deliverables: "Three short bullets.", completionCriteria: "Submitted by Sunday night.", submissionTypes: ["text"], checklist: [], links: [], requiresReview: false, reviewerId: null, timezone: "America/New_York" },
  });

  await db.insert(s.events).values([
    { title: "Weekly team meeting", type: "meeting", startsAt: new Date(now + 2 * D), endsAt: new Date(now + 2 * D + H), location: "Video call", createdById: U.jacob },
    { title: "Courage Box packing day", type: "volunteer", startsAt: new Date(now + 6 * D), endsAt: new Date(now + 6 * D + 3 * H), location: "Community center (sample)", createdById: U.jacob, projectId: P("Courage Box Distribution") },
    { title: "Holiday fundraiser booth", type: "fundraising", startsAt: new Date(now + 12 * D), endsAt: new Date(now + 12 * D + 3 * H), location: "Downtown (sample)", createdById: U.jacob },
    { title: "Leadership planning session", type: "meeting", visibility: "leadership", startsAt: new Date(now + 9 * D), endsAt: new Date(now + 9 * D + H), createdById: U.jacob },
    { title: "Boxes shipped milestone", type: "milestone", allDay: true, startsAt: new Date(now + 15 * D), createdById: U.jacob },
  ]);
  await db.insert(s.announcements).values([
    { title: "Welcome to the new Team Portal!", body: "Everything we do now lives here: your assignments, deadlines, submissions and team news.\n\nStart on Home to see what's on your plate this week. If anything looks off, message Jacob.", category: "news", pinned: true, requireAck: true, authorId: U.jacob, publishAt: new Date(now - 2 * H), notifiedAt: new Date(now - 2 * H) },
    { title: "Packing day next week", body: "We'll pack boxes together next week. Check the calendar for the time and location, and sign up with Isaac.", category: "event", authorId: U.jacob, publishAt: new Date(now - 26 * H), notifiedAt: new Date(now - 26 * H) },
    { title: "Leadership: weekly updates are now recurring tasks", body: "Each Friday you'll get a 'Weekly department update' task. Three bullets is plenty.", category: "policy", audience: { roles: ["leader"] }, authorId: U.jacob, publishAt: new Date(now - 50 * H), notifiedAt: new Date(now - 50 * H) },
  ]);
  await db.insert(s.resources).values([
    { title: "Team Handbook", category: "Handbook", kind: "note", body: "How we work together: weekly rhythm, how tasks and reviews work, and who to ask for what.\n\n(Replace this sample with the real handbook.)", pinned: true, createdById: U.jacob },
    { title: "Leadership Expectations", category: "Policies", kind: "note", visibility: "leadership", body: "What every director commits to. (Sample — replace with the approved version.)", createdById: U.jacob },
    { title: "Code of Conduct", category: "Policies", kind: "note", body: "Be kind, be reliable, protect the privacy of every child and family. (Sample.)", pinned: true, createdById: U.jacob },
    { title: "Submission Guidelines", category: "Guides", kind: "note", body: "1. Read the instructions and completion criteria.\n2. Upload files or add links.\n3. Add a short note.\n4. Click Submit for review.\n\nNever include patient names, photos or medical details unless the family has given written consent.", createdById: U.jacob },
    { title: "Brand kit", category: "Branding", kind: "note", body: "Navy #004F81 · Yellow #FED438 · Tagline: Their fight. Our mission.", createdById: U.jacob },
  ]);
  // Volunteer: shifts on the packing day, a past entry and a pending one.
  const packing = (await db.select().from(s.events)).find((e) => e.title === "Courage Box packing day")!;
  const sh = await db.insert(s.eventShifts).values([
    { eventId: packing.id, label: "Setup", startsAt: packing.startsAt, endsAt: new Date(packing.startsAt.getTime() + H), capacity: 3, notes: "Bring tape and markers" },
    { eventId: packing.id, label: "Packing", startsAt: new Date(packing.startsAt.getTime() + H), endsAt: new Date(packing.startsAt.getTime() + 3 * H), capacity: 8 },
  ]).returning();
  await db.insert(s.shiftSignups).values([{ shiftId: sh[0].id, userId: U.isaac }, { shiftId: sh[1].id, userId: U.julia }, { shiftId: sh[1].id, userId: U.sam }]);
  await db.insert(s.volunteerHours).values([
    { userId: U.arleigh, date: new Date(now - 20 * D).toISOString().slice(0, 10), minutes: 120, activity: "Toy drive collection (sample)", status: "approved", reviewedById: U.jacob, reviewedAt: new Date(now - 19 * D) },
    { userId: U.arleigh, date: new Date(now - 2 * D).toISOString().slice(0, 10), minutes: 90, activity: "Made holiday graphics (sample)", status: "pending" },
  ]);

  // Meetings, polls, shout-outs
  const weekly = (await db.select().from(s.events)).find((e) => e.title === "Weekly team meeting")!;
  const [mt] = await db.insert(s.meetings).values({ eventId: weekly.id, title: weekly.title, startsAt: weekly.startsAt, agenda: "1. Wins from this week\n2. Packing day plan\n3. Holiday campaign graphics\n4. Questions", createdById: U.jacob, updatedById: U.jacob }).returning();
  const [past] = await db.insert(s.meetings).values({ title: "Kickoff meeting (sample)", startsAt: new Date(now - 6 * D), agenda: "1. Welcome\n2. Roles", notes: "Everyone introduced themselves. Decided on weekly check-ins.\nJulia will draft the sponsor list.", createdById: U.jacob, updatedById: U.jacob, notesSharedAt: new Date(now - 6 * D) }).returning();
  const att: { meetingId: string; userId: string; status: "present" | "excused" }[] = [U.jacob, U.julia, U.isaac, U.arleigh, U.owen].map((userId) => ({ meetingId: past.id, userId, status: "present" }));
  att.push({ meetingId: past.id, userId: U.reese, status: "excused" });
  await db.insert(s.meetingAttendance).values(att);
  void mt;
  const [poll] = await db.insert(s.polls).values({ question: "Which day works best for packing?", options: [{ id: "sat", label: "Saturday morning" }, { id: "sun", label: "Sunday afternoon" }, { id: "fri", label: "Friday after school" }], createdById: U.isaac, closesAt: new Date(now + 4 * D) }).returning();
  await db.insert(s.pollVotes).values([{ pollId: poll.id, userId: U.julia, optionIds: ["sat"] }, { pollId: poll.id, userId: U.owen, optionIds: ["sun"] }, { pollId: poll.id, userId: U.david, optionIds: ["sat"] }]);
  const [so] = await db.insert(s.shoutouts).values({ fromId: U.jacob, badge: "above", message: "Arleigh made the holiday graphics in one night. They look amazing!", createdAt: new Date(now - 3 * H) }).returning();
  await db.insert(s.shoutoutRecipients).values({ shoutoutId: so.id, userId: U.arleigh });
  await db.insert(s.shoutoutCheers).values([{ shoutoutId: so.id, userId: U.julia }, { shoutoutId: so.id, userId: U.owen }]);

  // Chat: team chat, one work pair with a shared task, and a direct message.
  const [team] = await db.insert(s.conversations).values({ kind: "team", title: "Everyone", description: "The whole Courage for Kids team.", lastMessageAt: new Date(now - 20 * 60_000) }).returning();
  await db.insert(s.conversationMembers).values(Object.values(U).map((userId) => ({ conversationId: team.id, userId, lastReadAt: new Date(now - 60 * 60_000) })));
  await db.insert(s.messages).values([
    { conversationId: team.id, authorId: U.jacob, body: "Welcome to team chat! Use this for anything the whole team should see.", createdAt: new Date(now - 90 * 60_000) },
    { conversationId: team.id, authorId: U.arleigh, body: "Holiday graphics are almost done, will submit tonight 🎨", createdAt: new Date(now - 40 * 60_000) },
    { conversationId: team.id, authorId: U.isaac, body: "Packing day sign-ups are open. Bring a friend!", createdAt: new Date(now - 20 * 60_000) },
  ]);
  const [pair] = await db.insert(s.conversations).values({ kind: "workgroup", title: "Sponsor outreach", description: "Julia + Isaac reaching out to local businesses.", createdById: U.jacob, lastMessageAt: new Date(now - 30 * 60_000) }).returning();
  await db.insert(s.conversationMembers).values([U.julia, U.isaac].map((userId) => ({ conversationId: pair.id, userId })));
  await db.insert(s.messages).values([
    { conversationId: pair.id, body: "Jacob Rogers created the work group “Sponsor outreach”", system: true, createdAt: new Date(now - 60 * 60_000) },
    { conversationId: pair.id, authorId: U.julia, body: "I'll take the coffee shops, can you do the bookstores?", createdAt: new Date(now - 35 * 60_000) },
    { conversationId: pair.id, authorId: U.isaac, body: "Yep! I'll draft the email tonight.", createdAt: new Date(now - 30 * 60_000) },
  ]);
  const [pt] = await db.insert(s.tasks).values({ ...base, title: "Contact 10 local businesses about sponsoring boxes (sample)", instructions: "Split the list between you. Log who said yes.", priority: "medium", status: "in_progress", dueAt: new Date(now + 7 * D), workGroupId: pair.id, reviewerId: U.jacob, createdById: U.jacob, departmentId: dep("fundraising") }).returning();
  await db.insert(s.taskAssignees).values([{ taskId: pt.id, userId: U.julia }, { taskId: pt.id, userId: U.isaac }]);
  const [dm] = await db.insert(s.conversations).values({ kind: "dm", dmKey: [U.jacob, U.reese].sort().join(":"), createdById: U.jacob, lastMessageAt: new Date(now - 10 * 60_000) }).returning();
  await db.insert(s.conversationMembers).values([{ conversationId: dm.id, userId: U.jacob }, { conversationId: dm.id, userId: U.reese }]);
  await db.insert(s.messages).values({ conversationId: dm.id, authorId: U.reese, body: "Do we know how many teens are on the hospital list yet?", createdAt: new Date(now - 10 * 60_000) });

  console.log(`Demo data ready. Sign in as jacob@demo.cfk.test (admin), julia@demo.cfk.test (leader) or sam@demo.cfk.test (volunteer). Password: ${DEMO_PASSWORD}`);
  await close();
}
main().catch((e) => { console.error(e); process.exit(1); });
