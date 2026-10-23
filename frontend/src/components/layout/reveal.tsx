import type { CSSProperties } from 'react';

/**
 * Révélation mot par mot (CSS pur, sans JavaScript) : chaque mot passe du flou à net.
 * Le texte reste lisible tel quel par les lecteurs d'écran (aria-label sur le conteneur).
 */
export function RevealWords({ text, start = 0, step, className = '' }: { text: string; start?: number; step: number; className?: string }) {
  const words = text.split(' ');
  return (
    <span className={className} aria-label={text} role="text">
      {words.map((w, i) => (
        <span key={i} aria-hidden>
          <span className="reveal-word" style={{ animationDelay: `${start + i * step}ms` } as CSSProperties}>
            {w}
          </span>
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}

/** Durée totale d'une révélation (pour enchaîner l'apparition des boutons). */
export const revealEnd = (text: string, start: number, step: number) => start + (text.split(' ').length - 1) * step + 700;
