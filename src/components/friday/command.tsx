"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Radio, Send, Square, Volume2, VolumeX } from "lucide-react";
import { useVoice } from "./use-voice";

type Line = { role: "user" | "assistant"; content: string };

/** Animated orb: reacts to the mic while listening and pulses while she speaks or thinks. */
function Orb({ level, state }: { level: number; state: "idle" | "listening" | "thinking" | "speaking" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const lv = useRef(level); lv.current = level;
  const st = useRef(state); st.current = state;
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const S = 260; c.width = S * dpr; c.height = S * dpr; ctx.scale(dpr, dpr);
    let raf = 0, t = 0;
    const draw = () => {
      t += 0.016;
      ctx.clearRect(0, 0, S, S);
      const s = st.current;
      const amp = s === "listening" ? 0.15 + lv.current * 0.85 : s === "speaking" ? 0.45 + 0.35 * Math.abs(Math.sin(t * 6)) : s === "thinking" ? 0.25 + 0.1 * Math.sin(t * 3) : 0.08;
      const cx = S / 2, cy = S / 2, R = 70;
      const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, R + 40);
      g.addColorStop(0, s === "speaking" ? "rgba(254,212,56,0.35)" : "rgba(56,189,248,0.35)"); g.addColorStop(1, "rgba(2,10,22,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R + 40, 0, Math.PI * 2); ctx.fill();
      const bars = 72;
      for (let i = 0; i < bars; i++) {
        const a = (i / bars) * Math.PI * 2;
        const wob = Math.sin(a * 3 + t * 4) * 0.5 + Math.sin(a * 7 - t * 6) * 0.5;
        const len = 6 + amp * 34 * (0.55 + 0.45 * wob);
        ctx.strokeStyle = i % 9 === 0 ? "rgba(254,212,56,0.9)" : "rgba(125,211,252,0.85)";
        ctx.lineWidth = 2; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.lineTo(cx + Math.cos(a) * (R + len), cy + Math.sin(a) * (R + len)); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(56,189,248,0.6)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, R - 8, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(4,20,42,0.9)"; ctx.beginPath(); ctx.arc(cx, cy, R - 10, 0, Math.PI * 2); ctx.fill();
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} style={{ width: 260, height: 260 }} aria-hidden />;
}

export function Command({ initial, firstName }: { initial: Line[]; firstName: string }) {
  const [lines, setLines] = useState<Line[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(true);
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const voiceRef = useRef<ReturnType<typeof useVoice> | null>(null);
  const voiceRefReplies = useRef(voiceReplies);
  useEffect(() => { voiceRefReplies.current = voiceReplies; }, [voiceReplies]);

  const send = useCallback(async (msg: string, channel: "text" | "voice") => {
    const t = msg.trim();
    if (!t || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    setLines((l) => [...l, { role: "user", content: t }]);
    try {
      const res = await fetch("/api/friday/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t, channel }) });
      if (res.status === 401) { router.push("/login"); return; }
      const data = (await res.json()) as { reply?: string; error?: string };
      const reply = data.reply ?? data.error ?? "No reply.";
      setLines((l) => [...l, { role: "assistant", content: reply }]);
      if (channel === "voice" || voiceRefReplies.current) voiceRef.current?.speak(reply);
      router.refresh();
    } catch {
      setLines((l) => [...l, { role: "assistant", content: "I couldn't reach the server. Check your connection and try again." }]);
    } finally {
      busyRef.current = false; setBusy(false);
    }
  }, [router]);

  const voice = useVoice(useCallback((u: string) => { void send(u, "voice"); }, [send]));
  voiceRef.current = voice;

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [lines, busy]);

  const state = voice.speaking ? "speaking" : busy ? "thinking" : voice.mode !== "off" ? "listening" : "idle";
  const label = { idle: "Standing by", listening: voice.mode === "wake" ? "Listening for “Friday”" : "Listening…", thinking: "Working…", speaking: "Speaking" }[state];

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <div className="fr-panel flex flex-col items-center p-5">
        <Orb level={voice.level} state={state} />
        <div className="fr-eyebrow mt-1">{label}</div>
        <p className="mt-2 min-h-5 text-center text-sm text-fr-muted" aria-live="polite">{voice.interim}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" className={`fr-btn ${voice.mode === "push" ? "fr-btn-gold" : "fr-btn-ghost"}`} onClick={() => (voice.mode === "push" ? voice.stop() : voice.start("push"))} disabled={!voice.supported.stt}>
            <Mic className="h-4 w-4" aria-hidden />{voice.mode === "push" ? "Listening" : "Push to talk"}
          </button>
          <button type="button" className={`fr-btn ${voice.mode === "wake" ? "fr-btn-primary" : "fr-btn-ghost"}`} onClick={() => (voice.mode === "wake" ? voice.stop() : voice.start("wake"))} disabled={!voice.supported.stt}>
            <Radio className="h-4 w-4" aria-hidden />{voice.mode === "wake" ? "Hands-free on" : "Hands-free"}
          </button>
          {voice.speaking && <button type="button" className="fr-btn fr-btn-ghost" onClick={voice.stopSpeaking}><Square className="h-4 w-4" aria-hidden />Stop</button>}
          <button type="button" className="fr-btn fr-btn-ghost" onClick={() => setVoiceReplies((v) => !v)} aria-pressed={voiceReplies} title="Read replies aloud">
            {voiceReplies ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}<span className="sr-only">Read replies aloud</span>
          </button>
        </div>
        {voice.error && <p role="alert" className="mt-3 text-center text-sm text-fr-bad">{voice.error}</p>}
        {!voice.supported.stt && <p className="mt-3 text-center text-xs text-fr-muted">Voice fr-input needs Chrome, Edge or Safari.</p>}
        <p className="mt-4 text-center text-xs text-fr-muted">Hands-free listens only while this page is open. Say &ldquo;Friday&rdquo; or &ldquo;Hey Friday&rdquo;, then follow up without repeating it. Say &ldquo;stop&rdquo; to interrupt.</p>
      </div>

      <div className="fr-panel flex min-h-[520px] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto p-5" style={{ maxHeight: "62vh" }}>
          {lines.length === 0 && <p className="text-fr-muted">Good to see you, {firstName}. Ask me anything, or try &ldquo;Friday, what&rsquo;s happening with Courage for Kids?&rdquo;</p>}
          {lines.map((l, i) => (
            <div key={i} className={l.role === "user" ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-fr-navy/70 px-4 py-2.5" : "max-w-[90%] rounded-2xl rounded-bl-md border border-fr-line bg-fr-deep/80 px-4 py-2.5"}>
              {l.role === "assistant" && <div className="fr-eyebrow mb-1 !text-[10px]">Friday</div>}
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{l.content}</p>
            </div>
          ))}
          {busy && <div className="max-w-[90%] rounded-2xl border border-fr-line bg-fr-deep/80 px-4 py-2.5 text-fr-muted">Working on it…</div>}
          <div ref={end} />
        </div>
        <form className="flex gap-2 border-t border-fr-line p-3" onSubmit={(e) => { e.preventDefault(); const t = text; setText(""); void send(t, "text"); }}>
          <label htmlFor="cmd" className="sr-only">Message Friday</label>
          <input id="cmd" className="fr-input" placeholder="Message Friday…" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          <button className="fr-btn fr-btn-primary" disabled={busy || !text.trim()}><Send className="h-4 w-4" aria-hidden /><span className="sr-only">Send</span></button>
        </form>
      </div>
    </div>
  );
}
