import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/auth";

export default async function SettingsIndex() {
  await requireAdmin();
  redirect("/settings/members");
}
