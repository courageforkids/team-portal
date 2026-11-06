import Link from "next/link";
export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div><h1 className="text-xl font-bold">Page not found</h1><p className="mt-1 text-sm text-muted">This page doesn&apos;t exist.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-semibold text-brand-ink hover:underline">Go to the Team Portal</Link></div>
    </div>
  );
}
