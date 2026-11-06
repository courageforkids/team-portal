import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";

export function connect() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

export const DEPARTMENTS = [
  { name: "Executive", slug: "executive", color: "#004F81", description: "Leadership, strategy, partnerships and compliance." },
  { name: "Fundraising", slug: "fundraising", color: "#B45309", description: "Donations, sponsorships, grants and fundraising events." },
  { name: "Volunteer Coordination", slug: "volunteers", color: "#0E7490", description: "Recruiting, scheduling and supporting volunteers." },
  { name: "Patient Interaction", slug: "patient-interaction", color: "#BE185D", description: "Hospital relationships and the experience of the kids and families we serve." },
  { name: "Logistics & Outreach", slug: "logistics", color: "#15803D", description: "Courage Box packing, inventory, shipping and community outreach." },
  { name: "Media", slug: "media", color: "#7C3AED", description: "Social media, photography, press and brand." },
  { name: "Creative Engagement", slug: "creative", color: "#C2410C", description: "Creative campaigns, activities and community engagement ideas." },
  { name: "Initiatives", slug: "initiatives", color: "#4338CA", description: "New programs and special initiatives." },
] as const;

export const CATEGORIES = [
  { name: "Social media", color: "#7C3AED" }, { name: "Outreach", color: "#0E7490" }, { name: "Fundraising", color: "#B45309" },
  { name: "Courage Boxes", color: "#15803D" }, { name: "Events", color: "#BE185D" }, { name: "Admin", color: "#475569" },
];
