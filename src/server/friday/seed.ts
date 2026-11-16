import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fridayMemories, fridayPartners, fridaySettings } from "@/db/schema";

/** What F.R.I.D.A.Y. starts out knowing. Facts only from Jacob and his email, each with a source. Runs once. */
const FACTS: { kind: string; title: string; content: string; source: string }[] = [
  { kind: "fact", title: "Who we are", content: "Courage for Kids is a youth-founded, student-led 501(c)(3) in Spartanburg, South Carolina (EIN 39-3833022), founded by Jacob Rogers. It supports children with pediatric cancer and their families with comfort, encouragement, practical support and awareness. Motto: \"Their fight. Our mission.\" Colors: navy #004F81 and yellow #FED438. Instagram @teamcourageforkids.", source: "Jacob (setup, Nov 2026)" },
  { kind: "fact", title: "Programs", content: "Main program: Courage Boxes, comfort items and care packages for kids in treatment. Parent Boxes for the families beside them.", source: "Jacob (setup, Nov 2026)" },
  { kind: "fact", title: "First delivery", content: "On November 3, 2026 the team delivered its first 22 Courage Boxes to Prisma Health Children's Hospital in Columbia, SC. The next round goes to Prisma Health and ECU Health.", source: "Jacob (Nov 2026)" },
  { kind: "fact", title: "Fundraising so far", content: "Over $3,000 raised as of November 2026. Product donors include Minky Couture, Lola Blankets and Byourbed.", source: "Jacob (Nov 2026)" },
  { kind: "fact", title: "Mailing address", content: "Courage for Kids, 254 Keaton Court, Spartanburg, SC 29301. Phone 864-804-0430.", source: "Jacob (setup)" },
  { kind: "preference", title: "Email rules", content: "Friday only writes drafts; Jacob sends everything himself. Never send, forward or delete email.", source: "Jacob" },
  { kind: "preference", title: "No thank-you notes", content: "Jacob doesn't do thank-you notes. Don't draft them.", source: "Jacob" },
  { kind: "preference", title: "In-kind gifts", content: "Never put a dollar value on donated items.", source: "Jacob" },
  { kind: "preference", title: "Patient privacy", content: "Never record or repeat patient names, photos or medical details. Reese must not contact families or the hospital.", source: "Jacob" },
  { kind: "preference", title: "Outreach voice", content: "Professional, warm, genuine and youth-led. Short, simple, a motivated teen founder. Sign off \"Best,\".", source: "Jacob" },
];

const PARTNERS: { name: string; kind: string; status: string; promised?: string; notes: string; nextStep?: string }[] = [
  { name: "Prisma Health Children's Hospital", kind: "hospital", status: "received", notes: "Received the first 22 Courage Boxes on Nov 3, 2026 (Columbia, SC).", nextStep: "Coordinate the next delivery" },
  { name: "ECU Health", kind: "hospital", status: "contacted", notes: "Next round of Courage Boxes goes here.", nextStep: "Confirm delivery details" },
  { name: "Minky Couture", kind: "brand", status: "received", notes: "Donated products." },
  { name: "Lola Blankets", kind: "brand", status: "received", notes: "Donated products." },
  { name: "Byourbed", kind: "brand", status: "received", notes: "Donated products." },
  { name: "Casio", kind: "brand", status: "received", promised: "Recognition on social media", notes: "Donated an fx-CG50 calculator (Aug 2026)." },
  { name: "CO'COON", kind: "brand", status: "received", notes: "Donated blankets (shipped Oct 23, 2026)." },
  { name: "Yaber", kind: "brand", status: "committed", promised: "Unboxing reel on Instagram and tags in posts made with it", notes: "Offered a free refurbished K2S projector (Nov 13, 2026). Reply drafted accepting it.", nextStep: "Send the acceptance reply, then post the unboxing reel when it arrives" },
  { name: "Insta360", kind: "brand", status: "replied", notes: "Replied to the camera request; 501(c)(3) letter sent Nov 11, 2026.", nextStep: "Wait for their decision" },
];

export async function seedOrgKnowledge() {
  const [s] = await db.select({ orgSeeded: fridaySettings.orgSeeded }).from(fridaySettings).where(eq(fridaySettings.id, 1));
  if (!s || s.orgSeeded) return;
  const claimed = await db.update(fridaySettings).set({ orgSeeded: true }).where(eq(fridaySettings.orgSeeded, false)).returning({ id: fridaySettings.id });
  if (!claimed.length) return;
  await db.insert(fridayMemories).values(FACTS.map((f) => ({ ...f, verified: true })));
  await db.insert(fridayPartners).values(PARTNERS.map((p) => ({ name: p.name, kind: p.kind, status: p.status, promised: p.promised ?? "", notes: p.notes, nextStep: p.nextStep ?? "", source: "Jacob's email and setup (Nov 2026)" }))).onConflictDoNothing();
}
