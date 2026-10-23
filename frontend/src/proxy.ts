import { NextResponse, type NextRequest } from 'next/server';

const COOKIE = process.env.SESSION_COOKIE_NAME || 'tm_session';

/**
 * Redirige vers la connexion les visiteurs sans session qui ouvrent un espace privé.
 * Ce n'est qu'un confort de navigation : les autorisations sont toujours vérifiées par l'API.
 */
export function proxy(req: NextRequest) {
  if (req.cookies.get(COOKIE)?.value) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/connexion';
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/vendeur/:path*', '/compte/:path*', '/favoris/:path*'],
};
