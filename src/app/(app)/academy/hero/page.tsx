import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { requireAcademy } from "@/server/academy";
import { PageHeader } from "@/components/ui/page-header";
import { AcademyTabs } from "@/components/academy/tabs";
import { AcademyMusic } from "@/components/academy/music";
import { HeroCreator } from "@/components/academy/hero-creator";
import { CAPES, capeLabel, isCape } from "@/lib/academy";

export const metadata = { title: "My hero" };

export default async function HeroPage() {
  const me = await requireUser();
  const a = await requireAcademy(me);
  const [u] = await db.select({ hero: users.hero, cape: users.cape, heroAvatar: users.heroAvatar }).from(users).where(eq(users.id, me.id));
  const cape = u?.cape && isCape(u.cape) ? u.cape : null;
  return (
    <>
      <AcademyMusic track={cape ?? "academy"} />
      <AcademyTabs myCape={cape} admin={me.role === "admin"} />
      <PageHeader title="My hero" description={u?.hero ? "Change anything, anytime." : "Design your own hero. It shows on your hero card, in your Cape's room, and (if you want) as your profile picture."} />
      <HeroCreator initial={u?.hero ?? null} capeColor={cape ? CAPES[cape].color : "#004F81"} capeName={cape ? capeLabel(cape, a.capes) : null} name={me.name.split(" ")[0]} heroAvatar={!!u?.heroAvatar} />
    </>
  );
}
