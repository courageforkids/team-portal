export function PlaneIcon({ className, color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M2 11.5 21.5 3l-5 18-4.6-6.3L2 11.5Z" fill={color} fillOpacity=".25" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M21.5 3 11.9 14.7V20l2.6-3.2" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
