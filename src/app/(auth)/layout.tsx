import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 right-[-120px] h-[380px] w-[380px] rounded-full bg-accent/25 blur-3xl" />
      <div className="relative w-full max-w-[420px] animate-in">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white shadow-card ring-1 ring-line">
            <Image src="/logo.png" alt="Courage for Kids" width={36} height={33} priority />
          </span>
          <div className="text-xl font-bold tracking-tight">Courage for Kids</div>
          <div className="text-sm text-muted">Team Portal · <span className="italic">Their fight. Our mission.</span></div>
        </div>
        <div className="card p-6 shadow-card sm:p-7">{children}</div>
        <p className="mt-6 text-center text-xs text-faint">Private portal for the Courage for Kids team. Access is by invitation only.</p>
      </div>
    </div>
  );
}
