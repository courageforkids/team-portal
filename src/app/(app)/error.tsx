"use client";
import { useEffect } from "react";
import { RotateCcw, Home } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

/** Shown instead of a blank screen if something on a page crashes. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    // After an update, a phone may still hold old app files: reload once to pick up the new ones.
    if (/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(`${error.name} ${error.message}`)) {
      try { if (!sessionStorage.getItem("cfk-reloaded")) { sessionStorage.setItem("cfk-reloaded", "1"); location.reload(); } } catch { location.reload(); }
    }
  }, [error]);
  return (
    <div className="card mx-auto mt-6 max-w-lg p-6 text-center">
      <h1 className="text-lg font-bold">Something didn't load right</h1>
      <p className="mt-1 text-sm text-muted">Try again. If it keeps happening, send a screenshot of this screen to an administrator.</p>
      <div className="mt-5 flex justify-center gap-2">
        <button onClick={() => reset()} className={buttonClass("primary")}><RotateCcw className="h-4 w-4" />Try again</button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full reload is intentional when recovering */}
        <a href="/" className={buttonClass("secondary")}><Home className="h-4 w-4" />Home</a>
      </div>
      <p className="mt-5 break-words font-mono text-[11px] text-faint">{error.name}: {error.message?.slice(0, 200)}{error.digest ? ` · ${error.digest}` : ""}</p>
    </div>
  );
}
