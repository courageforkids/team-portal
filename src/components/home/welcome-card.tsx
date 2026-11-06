"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Send, Bell, X } from "lucide-react";
import { finishOnboardingAction } from "@/server/home-actions";
import { Button } from "@/components/ui/button";

export function WelcomeCard({ name, role }: { name: string; role: string }) {
  const [hidden, setHidden] = useState(false);
  const [, start] = useTransition();
  const router = useRouter();
  if (hidden) return null;
  const done = () => { setHidden(true); start(async () => { await finishOnboardingAction(); router.refresh(); }); };
  const steps = role === "admin"
    ? [{ icon: CheckSquare, t: "Assign work", d: "Create tasks from All tasks → New task." }, { icon: Send, t: "Review submissions", d: "Approve or request changes in the Review center." }, { icon: Bell, t: "Invite your team", d: "Settings → Invitations creates sign-up links." }]
    : [{ icon: CheckSquare, t: "Check your tasks", d: "Everything assigned to you is under My tasks." }, { icon: Send, t: "Submit your work", d: "Open a task, add files or a response, and submit for review." }, { icon: Bell, t: "Watch for feedback", d: "You'll get a notification when work is approved or needs changes." }];
  return (
    <section className="card animate-in relative p-5" aria-label="Getting started">
      <button onClick={done} aria-label="Dismiss" className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg"><X className="h-4 w-4" /></button>
      <h2 className="font-semibold">Welcome to the Team Portal, {name}! 👋</h2>
      <p className="mt-0.5 text-sm text-muted">Here’s how it works — it takes about a minute to learn.</p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 rounded-xl bg-surface-2 p-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand text-brand-fg"><s.icon className="h-4 w-4" /></span>
            <span><span className="block text-sm font-semibold">{i + 1}. {s.t}</span><span className="block text-xs text-muted">{s.d}</span></span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex justify-end"><Button size="sm" onClick={done}>Got it</Button></div>
    </section>
  );
}
