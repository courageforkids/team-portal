"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The app opens instantly from the last saved copy of the page (see public/sw.js). If this copy was rendered
 * more than a couple of seconds ago, quietly fetch the latest data so it updates in place.
 */
export function FreshOnLaunch({ renderedAt }: { renderedAt: number }) {
  const router = useRouter();
  useEffect(() => {
    if (Date.now() - renderedAt > 2_000) router.refresh();
    // Only on first load of this document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
