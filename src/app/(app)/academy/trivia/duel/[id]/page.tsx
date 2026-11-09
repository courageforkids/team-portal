import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { triviaDuels, users } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { requireAcademy } from "@/server/academy";
import { DUEL_QUESTIONS } from "@/server/trivia";
import { AcademyMusic } from "@/components/academy/music";
import { DuelPlay } from "@/components/academy/trivia";

export const metadata = { title: "Trivia duel" };

export default async function DuelPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  await requireAcademy(me);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [d] = await db.select().from(triviaDuels).where(eq(triviaDuels.id, id));
  if (!d || (d.challengerId !== me.id && d.opponentId !== me.id)) notFound();
  const mine = d.challengerId === me.id;
  const [other] = await db.select({ name: users.name }).from(users).where(eq(users.id, mine ? d.opponentId : d.challengerId));
  const answers = mine ? d.challengerAnswers : d.opponentAnswers;
  return (
    <>
      <AcademyMusic track="trivia" />
      <DuelPlay duelId={d.id} otherName={other?.name.split(" ")[0] ?? "your opponent"} alreadyDone={answers.length >= DUEL_QUESTIONS || d.status === "declined" || d.status === "expired"} startScore={answers.filter((a) => a.correct).length} />
    </>
  );
}
