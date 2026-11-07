/**
 * The home-screen app opens here first. It's a tiny static page served instantly from the CDN,
 * so people see the Courage for Kids splash instead of a blank screen while the portal loads.
 * It moves on immediately; the splash stays on screen until the portal's first page is ready.
 */
export const dynamic = "force-static";

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#004F81"><title>Courage for Kids</title>
<style>
html,body{margin:0;height:100%;background:#004F81;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.w{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px}
.logo{width:112px;height:112px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;animation:p 1.6s ease-in-out infinite}
.logo img{width:78px}
h1{margin:10px 0 0;font-size:26px;font-weight:800;letter-spacing:-.01em}
p{margin:0;color:#FED438;font-weight:700;font-size:15px}
.d{display:flex;gap:7px;margin-top:22px}.d i{width:8px;height:8px;border-radius:50%;background:#FED438;opacity:.35;animation:b 1s infinite}
.d i:nth-child(2){animation-delay:.15s}.d i:nth-child(3){animation-delay:.3s}
@keyframes p{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}@keyframes b{0%,100%{opacity:.35}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){.logo,.d i{animation:none}}
</style></head><body><div class="w">
<div class="logo"><img src="/logo.png" alt=""></div><h1>Courage for Kids</h1><p>Their fight. Our mission.</p>
<div class="d" aria-label="Loading"><i></i><i></i><i></i></div></div>
<script>location.replace("/")</script>
<noscript><meta http-equiv="refresh" content="0;url=/"></noscript>
</body></html>`;

export function GET() {
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=86400" } });
}
