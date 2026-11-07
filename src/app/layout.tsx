import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ToastProvider } from "@/components/ui/toaster";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Courage for Kids | Team Portal", template: "%s · Courage for Kids" },
  description: "Internal team portal for Courage for Kids.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "CFK Portal", statusBarStyle: "default" },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
};

// Applies the saved theme before paint to avoid a flash, and colors the phone's status bar to match
// the theme chosen in the portal (not just the phone's own setting).
const themeScript = `(function(){try{var m=matchMedia('(prefers-color-scheme: dark)');function a(){var t=localStorage.getItem('cfk-theme')||'light';var d=t==='dark'||(t==='system'&&m.matches);document.documentElement.classList.toggle('dark',d);var e=document.querySelector('meta[name=theme-color]');if(!e){e=document.createElement('meta');e.name='theme-color';document.head.appendChild(e)}e.setAttribute('content',d?'#0d1117':'#f7f7f5')}a();m.addEventListener&&m.addEventListener('change',a);window.__cfkTheme=a}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-dvh"><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
