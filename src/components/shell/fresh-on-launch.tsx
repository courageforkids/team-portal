"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * On a cold app launch the service worker shows the last saved copy of the page instantly (see public/sw.js)
 * and tags it with <meta name="cfk-from-cache">. When this page is that saved copy, fetch the latest data
 * so it updates in place.
 */
export function FreshOnLaunch() {
  const router = useRouter();
  useEffect(() => {
    if (document.querySelector('meta[name="cfk-from-cache"]')) router.refresh();
  }, [router]);
  return null;
}
