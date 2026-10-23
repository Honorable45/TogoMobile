'use client';

import type { ImgHTMLAttributes } from 'react';

/** Image qui se masque si elle ne peut pas être chargée (le fond de la carte reste visible). */
export function FallbackImg(props: ImgHTMLAttributes<HTMLImageElement>) {
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img {...props} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />;
}
