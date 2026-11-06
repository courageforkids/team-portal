import { requireUser } from "@/server/auth";
import { TasksPage } from "@/components/tasks/tasks-page";
export const metadata = { title: "My tasks" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  return <TasksPage me={me} sp={await searchParams} scope="mine" />;
}
