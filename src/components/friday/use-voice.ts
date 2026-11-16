"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/* Minimal typings for the Web Speech API (not in TypeScript's DOM lib everywhere). */
type SRAlternative = { transcript: string };
type SRResult = { isFinal: boolean; 0: SRAlternative; length: number };
type SREvent = { resultIndex: number; results: { length: number; [i: number]: SRResult } };
type SR = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: SREvent) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start(): void; stop(): void; abort(): void;
};
type SRCtor = new () => SR;

export type VoiceMode = "off" | "push" | "wake";

const WAKE = /\b(?:hey|okay|ok)?\s*fri(?:day|dae|die)\b[\s,.!?]*/i;
const INTERRUPT = /\b(fri(?:day|dae)|stop|wait|hold on|never ?mind|quiet)\b/i;
const FOLLOW_UP_MS = 9000;
/** Voices that tend to sound most natural, best first. Falls back to any English female-sounding voice. */
const PREFERRED = ["Microsoft Aria Online (Natural)", "Microsoft Jenny Online (Natural)", "Google UK English Female", "Samantha", "Serena", "Karen", "Moira", "Tessa", "Google US English", "Microsoft Zira"];

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = typeof speechSynthesis !== "undefined" ? speechSynthesis.getVoices() : [];
  for (const name of PREFERRED) { const v = voices.find((x) => x.name === name); if (v) return v; }
  return voices.find((v) => /en[-_](GB|US|AU|IE)/i.test(v.lang) && /female|aria|jenny|samantha|serena|karen|zira|libby|sonia/i.test(v.name))
    ?? voices.find((v) => /^en/i.test(v.lang)) ?? null;
}

/** Splits long text into sentences: some browsers cut off a single long utterance after ~15 seconds. */
const sentences = (t: string) => t.replace(/[*#_`>|]/g, "").match(/[^.!?]+[.!?]+["')\]]*|\S[^.!?]*$/g)?.map((s) => s.trim()).filter(Boolean) ?? [t];

export function useVoice(onUtterance: (text: string) => void) {
  const [supported, setSupported] = useState({ stt: false, tts: false });
  const [mode, setMode] = useState<VoiceMode>("off");
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  const rec = useRef<SR | null>(null);
  const modeRef = useRef<VoiceMode>("off");
  const speakingRef = useRef(false);
  const followUntil = useRef(0);
  const cb = useRef(onUtterance);
  const media = useRef<{ stream: MediaStream; ctx: AudioContext; raf: number } | null>(null);
  useEffect(() => { cb.current = onUtterance; }, [onUtterance]);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
    setSupported({ stt: !!(w.SpeechRecognition || w.webkitSpeechRecognition), tts: typeof speechSynthesis !== "undefined" });
    if (typeof speechSynthesis !== "undefined") speechSynthesis.getVoices();
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    speakingRef.current = false; setSpeaking(false);
    followUntil.current = Date.now() + FOLLOW_UP_MS;
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof speechSynthesis === "undefined" || !text) return;
    speechSynthesis.cancel();
    const voice = pickVoice();
    const parts = sentences(text);
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      if (voice) u.voice = voice;
      u.rate = 1.03; u.pitch = 1.0;
      if (i === 0) u.onstart = () => { speakingRef.current = true; setSpeaking(true); };
      if (i === parts.length - 1) u.onend = u.onerror = () => { speakingRef.current = false; setSpeaking(false); followUntil.current = Date.now() + FOLLOW_UP_MS; };
      speechSynthesis.speak(u);
    });
  }, []);

  const stopMeter = useCallback(() => {
    const m = media.current;
    if (!m) return;
    cancelAnimationFrame(m.raf); m.stream.getTracks().forEach((t) => t.stop()); void m.ctx.close();
    media.current = null; setLevel(0);
  }, []);

  const startMeter = useCallback(async () => {
    if (media.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext();
      const an = ctx.createAnalyser(); an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0; for (const v of buf) { const x = (v - 128) / 128; sum += x * x; }
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        if (media.current) media.current.raf = requestAnimationFrame(tick);
      };
      media.current = { stream, ctx, raf: requestAnimationFrame(tick) };
    } catch { /* the level meter is cosmetic */ }
  }, []);

  const handleFinal = useCallback((raw: string) => {
    const t = raw.trim();
    if (!t) return;
    if (modeRef.current === "push") { cb.current(t.replace(WAKE, "").trim() || t); return; }
    // Wake mode.
    if (speakingRef.current) {
      // Only an explicit interruption counts while she's talking (the mic can hear her own voice).
      if (!INTERRUPT.test(t)) return;
      stopSpeaking();
      const rest = t.replace(WAKE, "").replace(/^(stop|wait|hold on|never ?mind|quiet)[\s,.!?]*/i, "").trim();
      if (rest.split(/\s+/).length >= 2) cb.current(rest);
      return;
    }
    if (Date.now() < followUntil.current) { followUntil.current = 0; cb.current(t.replace(WAKE, "").trim() || t); return; }
    const m = t.match(WAKE);
    if (!m) return;
    const rest = t.slice((m.index ?? 0) + m[0].length).trim();
    if (rest) cb.current(rest);
    else { speak("Yes, sir?"); }
  }, [speak, stopSpeaking]);

  const stop = useCallback(() => {
    modeRef.current = "off"; setMode("off"); setInterim("");
    try { rec.current?.abort(); } catch { /* already stopped */ }
    rec.current = null; stopMeter();
  }, [stopMeter]);

  const start = useCallback((m: Exclude<VoiceMode, "off">) => {
    const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) { setError("Voice fr-input isn't supported in this browser. Try Chrome, Edge or Safari."); return; }
    try { rec.current?.abort(); } catch { /* ignore */ }
    setError("");
    modeRef.current = m; setMode(m);
    const r = new Ctor();
    r.lang = "en-US"; r.interimResults = true; r.continuous = m === "wake";
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) handleFinal(res[0].transcript);
        else live += res[0].transcript;
      }
      setInterim(live);
      if (live && speakingRef.current && INTERRUPT.test(live)) stopSpeaking();
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { setError("Microphone access is blocked. Allow it in your browser settings."); stop(); }
    };
    r.onend = () => {
      setInterim("");
      if (modeRef.current === "wake") setTimeout(() => { if (modeRef.current === "wake") try { r.start(); } catch { /* restarting */ } }, 250);
      else if (modeRef.current === "push") { modeRef.current = "off"; setMode("off"); stopMeter(); }
    };
    rec.current = r;
    try { r.start(); } catch { /* already started */ }
    void startMeter();
  }, [handleFinal, startMeter, stop, stopMeter, stopSpeaking]);

  useEffect(() => () => { stop(); if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); }, [stop]);

  return { supported, mode, speaking, interim, level, error, start, stop, speak, stopSpeaking };
}
