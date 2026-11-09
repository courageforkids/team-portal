"use client";
import { useEffect, useState } from "react";
import { Music, Music2, Volume2, VolumeX } from "lucide-react";
import { musicOn, playMusic, setMusic, setSound, soundOn, stopMusic, unlockAudio, type MusicTrack } from "@/lib/music";
import { cn } from "@/lib/cn";

/** Plays an Academy track while this page is open (after the first tap, as phones require). */
export function AcademyMusic({ track }: { track: MusicTrack }) {
  useEffect(() => {
    unlockAudio();
    if (!navigator.webdriver) playMusic(track);
    return () => stopMusic(1.2);
  }, [track]);
  return null;
}

/** Separate switches for music and sound effects. */
export function SoundControls({ track, className }: { track: MusicTrack; className?: string }) {
  const [m, setM] = useState(true);
  const [s, setS] = useState(true);
  useEffect(() => { setM(musicOn()); setS(soundOn()); }, []);
  const btn = "inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-semibold text-fg-2 shadow-soft hover:bg-surface-2";
  return (
    <div className={cn("flex gap-2", className)}>
      <button type="button" className={btn} aria-pressed={m} onClick={() => { const v = !m; setM(v); setMusic(v); if (v) playMusic(track); }}>
        {m ? <Music2 className="h-4 w-4" aria-hidden /> : <Music className="h-4 w-4 opacity-50" aria-hidden />}{m ? "Music on" : "Music off"}
      </button>
      <button type="button" className={btn} aria-pressed={s} onClick={() => { const v = !s; setS(v); setSound(v); }}>
        {s ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4 opacity-50" aria-hidden />}{s ? "Sounds on" : "Sounds off"}
      </button>
    </div>
  );
}
