"use client";
import { useEffect } from "react";

/** Last-resort error screen (when even the main layout fails). */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    if (/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(`${error.name} ${error.message}`)) {
      try { if (!sessionStorage.getItem("cfk-reloaded")) { sessionStorage.setItem("cfk-reloaded", "1"); location.reload(); } } catch { location.reload(); }
    }
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f7f7f5", color: "#111827", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, padding: 16 }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 18 }}>Something didn&apos;t load right</h1>
          <p style={{ fontSize: 14, color: "#6b7280" }}>Try again. If it keeps happening, send a screenshot of this screen to an administrator.</p>
          <button onClick={() => reset()} style={{ marginTop: 12, background: "#004F81", color: "#fff", border: 0, borderRadius: 10, padding: "10px 16px", fontWeight: 600 }}>Try again</button>
          <p style={{ marginTop: 16, fontFamily: "monospace", fontSize: 11, color: "#9ca3af", wordBreak: "break-word" }}>{error.name}: {error.message?.slice(0, 200)}{error.digest ? ` · ${error.digest}` : ""}</p>
        </div>
      </body>
    </html>
  );
}
