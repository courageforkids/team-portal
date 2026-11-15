"use client";
import { LogOut } from "lucide-react";
import { AvatarEditor } from "@/components/home/avatar-editor";
import { signOutAction } from "@/app/(auth)/actions";

/** Covers the portal until the member adds a real profile photo, so everyone can put a face to a name. */
export function PhotoGate({ name, fileId }: { name: string; fileId: string | null }) {
  const first = name.split(" ")[0];
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="photo-gate-title"
      className="fixed inset-0 z-[55] flex items-center justify-center overflow-y-auto bg-bg/95 p-5 backdrop-blur">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center shadow-pop">
        <h2 id="photo-gate-title" className="text-lg font-semibold text-fg">Add your profile photo, {first}</h2>
        <p className="mt-2 text-sm text-muted">
          Everyone on the team needs a real photo so we all know who&apos;s who. It only takes a second, and then you&apos;re in.
        </p>
        <div className="mt-6 flex justify-center"><AvatarEditor name={name} fileId={fileId} /></div>
        <form action={signOutAction} className="mt-6">
          <button className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-muted hover:bg-surface-2">
            <LogOut className="h-4 w-4" aria-hidden />Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
