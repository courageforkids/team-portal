"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { BellRing, BellOff, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { removePushSubscriptionAction, savePushSubscriptionAction, sendTestPushAction } from "@/server/push-actions";

type State = "loading" | "unsupported" | "install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

function usePush(publicKey: string) {
  const [state, setState] = useState<State>("loading");
  const refresh = useCallback(async () => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) { setState(isIos() && !isStandalone() ? "install" : "unsupported"); return; }
    if (Notification.permission === "denied") { setState("denied"); return; }
    const reg = await navigator.serviceWorker.register("/sw.js");
    const sub = await reg.pushManager.getSubscription();
    setState(sub ? "on" : "off");
  }, []);
  useEffect(() => { refresh().catch(() => setState("unsupported")); }, [refresh]);
  const enable = async () => {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return { ok: false as const, error: "Notifications weren't allowed." }; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
    const r = await savePushSubscriptionAction(sub.toJSON());
    if (r.ok) setState("on");
    return r;
  };
  const disable = async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await removePushSubscriptionAction(sub.endpoint); await sub.unsubscribe(); }
    setState("off");
    return { ok: true as const, message: "Notifications turned off for this device." };
  };
  return { state, enable, disable };
}

/** Full control for the Profile page. */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const { state, enable, disable } = usePush(publicKey);
  const [pending, start] = useTransition();
  const toast = useToast();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => {
    try { const r = await fn(); toast.push(r.ok ? "success" : "error", (r.ok ? r.message : r.error) ?? "Done"); }
    catch { toast.push("error", "Couldn't change notifications on this device. Try again."); }
  });
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink"><Smartphone className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold">Phone notifications</div>
          {state === "loading" && <p className="text-muted">Checking this device…</p>}
          {state === "on" && <p className="text-muted">On for this device. You'll get alerts on your lock screen.</p>}
          {state === "off" && <p className="text-muted">Get lock-screen alerts for new tasks, reviews and reminders on this device.</p>}
          {state === "install" && <p className="text-muted">On iPhone, first add the portal to your Home Screen (Share → Add to Home Screen), then open it from there and come back here.</p>}
          {state === "denied" && <p className="text-muted">Notifications are blocked for this site. Turn them on in your phone's Settings → Notifications, then reload.</p>}
          {state === "unsupported" && <p className="text-muted">This browser doesn't support notifications. Try Safari (iPhone, from the Home Screen) or Chrome.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {state === "off" && <Button size="sm" disabled={pending} onClick={() => run(enable)}><BellRing className="h-4 w-4" />Turn on notifications</Button>}
            {state === "on" && <>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => sendTestPushAction())}>Send a test</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(disable)}><BellOff className="h-4 w-4" />Turn off</Button>
            </>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Gentle one-time prompt on Home. Hidden once enabled or dismissed. */
export function PushPrompt({ publicKey }: { publicKey: string }) {
  const { state, enable } = usePush(publicKey);
  const [hidden, setHidden] = useState(true);
  const [pending, start] = useTransition();
  const toast = useToast();
  useEffect(() => { try { setHidden(localStorage.getItem("cfk-push-dismissed") === "1"); } catch { setHidden(false); } }, []);
  if (hidden || !(state === "off" || state === "install")) return null;
  const dismiss = () => { setHidden(true); try { localStorage.setItem("cfk-push-dismissed", "1"); } catch {} };
  return (
    <section className="card animate-in flex items-start gap-3 p-4" aria-label="Turn on notifications">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink"><BellRing className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold">Get alerts on your phone</div>
        {state === "install"
          ? <p className="text-muted">Add the portal to your Home Screen first (Share → Add to Home Screen), then open it from there to turn on notifications.</p>
          : <p className="text-muted">Know right away when you get a task, feedback or a reminder.</p>}
        {state === "off" && <Button size="sm" className="mt-2" disabled={pending} onClick={() => start(async () => {
          try { const r = await enable(); toast.push(r.ok ? "success" : "error", (r.ok ? r.message : r.error) ?? ""); } catch { toast.push("error", "Couldn't turn on notifications. Try again from your Profile."); }
        })}>Turn on notifications</Button>}
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg"><X className="h-4 w-4" /></button>
    </section>
  );
}
