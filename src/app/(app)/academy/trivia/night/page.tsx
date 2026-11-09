import { requireUser } from "@/server/auth";
import { requireAcademy } from "@/server/academy";
import { AcademyMusic } from "@/components/academy/music";
import { TriviaNight } from "@/components/academy/trivia";
import { activeCapes, capeLabel } from "@/lib/academy";

export const metadata = { title: "Trivia night" };

export default async function TriviaNightPage() {
  const me = await requireUser();
  const a = await requireAcademy(me);
  return (
    <>
      <AcademyMusic track="trivia" />
      <TriviaNight capeNames={Object.fromEntries(activeCapes(a.capeCount).map((c) => [c, capeLabel(c, a.capes)]))} />
    </>
  );
}
