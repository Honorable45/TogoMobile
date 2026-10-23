import { NextResponse, type NextRequest } from 'next/server';

const COOKIE = process.env.SESSION_COOKIE_NAME || 'tm_session';

/**
 * Sans session, toute page de l'administration redirige vers la connexion.
 * Ce n'est qu'un confort de navigation : chaque appel est autorisé par l'API (rôle ADMIN).
 */
export function proxy(req: NextRequest) {
  if (req.cookies.get(COOKIE)?.value) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/connexion';
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!connexion|api/|_next/|favicon\\.ico|icon).*)'],
};
