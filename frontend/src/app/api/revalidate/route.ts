import { revalidateTag } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';

/**
 * Invalidation ciblée du cache, appelée par l'API (worker) après un changement.
 * `expire: 0` : aucune donnée périmée n'est servie ensuite (un prix modifié n'est jamais affiché en retard).
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  const given = request.headers.get('x-revalidate-secret') ?? '';
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return Response.json({ revalidated: false }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { tags?: unknown } | null;
  const tags = Array.isArray(body?.tags) ? body.tags.filter((t): t is string => typeof t === 'string' && t.length <= 256).slice(0, 200) : [];
  if (!tags.length) return Response.json({ revalidated: false }, { status: 400 });
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: true, count: tags.length });
}
