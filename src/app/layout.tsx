import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ToastProvider } from "@/components/ui/toaster";
import { ViewportFix } from "@/components/shell/viewport-fix";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Courage for Kids | Team Portal", template: "%s · Courage for Kids" },
  description: "Internal team portal for Courage for Kids.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "CFK Portal", statusBarStyle: "default" },
};
const LIGHT = "#f7f7f5", DARK = "#0d1117";

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover", interactiveWidget: "resizes-content",
};

// Applies the saved theme before paint to avoid a flash, and colors the phone's status bar to match
// the theme chosen in the portal (not just the phone's own setting).
const themeScript = `(function(){try{var m=matchMedia('(prefers-color-scheme: dark)');function a(){var t=localStorage.getItem('cfk-theme')||'light';if(document.cookie.indexOf('cfk-theme='+t)<0)document.cookie='cfk-theme='+t+';path=/;max-age=31536000;samesite=lax';var d=t==='dark'||(t==='system'&&m.matches);document.documentElement.classList.toggle('dark',d);if(t!=='system'){document.querySelectorAll('meta[name=theme-color]').forEach(function(e){e.removeAttribute('media');e.setAttribute('content',d?'#0d1117':'#f7f7f5')})}}a();m.addEventListener&&m.addEventListener('change',a);window.__cfkTheme=a}catch(e){}})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The phone's top bar color comes from the first HTML it sees, so it's set here from the saved theme (cookie).
  const t = (await cookies()).get("cfk-theme")?.value;
  return (
    <html lang="en" className={jakarta.variable + (t === "dark" ? " dark" : "")} suppressHydrationWarning>
      <head>
        {t === "system"
          ? <><meta name="theme-color" media="(prefers-color-scheme: light)" content={LIGHT} /><meta name="theme-color" media="(prefers-color-scheme: dark)" content={DARK} /></>
          : <meta name="theme-color" content={t === "dark" ? DARK : LIGHT} />}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh"><ViewportFix /><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
