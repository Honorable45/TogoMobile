/**
 * Logos de marques tierces (non fournis par Lucide). Dessinés au même gabarit 24×24
 * et en couleur courante pour rester cohérents avec les icônes Lucide.
 */
type P = { className?: string };

export function WhatsAppIcon({ className = 'size-5' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.98L2 22l5.17-1.5A9.93 9.93 0 1 0 12.04 2Zm0 18.13a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.07.89.9-2.98-.2-.31a8.22 8.22 0 1 1 6.87 3.73Zm4.51-6.15c-.25-.12-1.46-.72-1.69-.8-.22-.08-.39-.12-.55.13-.17.24-.64.8-.78.96-.14.17-.29.19-.53.06a6.74 6.74 0 0 1-3.36-2.93c-.25-.44.25-.41.72-1.36.08-.16.04-.3-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.3c-.22.25-.86.84-.86 2.04s.88 2.37 1 2.53c.13.17 1.73 2.64 4.2 3.7 1.56.67 2.17.73 2.95.61.47-.07 1.46-.6 1.66-1.17.2-.58.2-1.07.15-1.17-.06-.11-.22-.17-.46-.29Z" />
    </svg>
  );
}

export function FacebookIcon({ className = 'size-5' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M13.5 21.9v-7.4h2.5l.4-2.9h-2.9V9.8c0-.84.24-1.42 1.45-1.42h1.54V5.8a20.6 20.6 0 0 0-2.25-.12c-2.23 0-3.75 1.36-3.75 3.86v2.07H8v2.9h2.49v7.4A10 10 0 1 1 13.5 21.9Z" />
    </svg>
  );
}

export function InstagramIcon({ className = 'size-5' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function TikTokIcon({ className = 'size-5' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M16.6 2h-3.3v13.2a2.9 2.9 0 1 1-2.1-2.8V9a6.2 6.2 0 1 0 5.4 6.2V8.6a7.6 7.6 0 0 0 4.4 1.4V6.7a4.4 4.4 0 0 1-4.4-4.4V2Z" />
    </svg>
  );
}

export function YouTubeIcon({ className = 'size-5' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M21.6 7.2a2.5 2.5 0 0 0-1.77-1.77C18.27 5 12 5 12 5s-6.27 0-7.83.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.77 1.77C5.73 19 12 19 12 19s6.27 0 7.83-.43a2.5 2.5 0 0 0 1.77-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z" />
    </svg>
  );
}
