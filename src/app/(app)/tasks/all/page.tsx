import { requireAdmin } from "@/server/auth";
import { TasksPage } from "@/components/tasks/tasks-page";
export const metadata = { title: "All tasks" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireAdmin();
  return <TasksPage me={me} sp={await searchParams} scope="all" />;
}
