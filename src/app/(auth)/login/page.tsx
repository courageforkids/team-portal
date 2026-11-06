import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-lg font-bold">Welcome back</h1>
      <p className="mb-5 text-sm text-muted">Sign in to see your assignments.</p>
      <LoginForm next={next ?? "/"} />
      <div className="mt-5 text-center text-sm"><Link href="/forgot-password" className="font-semibold text-brand-ink hover:underline">Forgot your password?</Link></div>
    </>
  );
}
