import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ToastProvider } from "@/components/ui/toaster";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Courage for Kids | Team Portal", template: "%s · Courage for Kids" },
  description: "Internal team portal for Courage for Kids.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f7f7f5" }, { media: "(prefers-color-scheme: dark)", color: "#0d1117" }],
  width: "device-width", initialScale: 1, viewportFit: "cover",
};

// Applies the saved theme before paint to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem('cfk-theme')||'light';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-dvh"><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
