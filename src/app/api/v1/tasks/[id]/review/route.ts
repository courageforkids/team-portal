import { z } from "zod";
import { apiRoute, jsonBody } from "@/server/api-auth";
import { reviewSubmission } from "@/server/tasks";

export const POST = apiRoute<{ params: Promise<{ id: string }> }>(async (req, actor, { params }) => {
  const b = await jsonBody(req);
  const decision = z.enum(["approved", "revision_requested"]).parse(b.decision);
  await reviewSubmission(actor, z.string().uuid().parse((await params).id), decision, typeof b.feedback === "string" ? b.feedback : "");
  return { ok: true };
});
