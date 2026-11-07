"""
Recherche du catalogue (page Catalogue et rangées de l'accueil).
Même requête SQL que l'API Node (backend/src/catalog/catalog-search.service.ts) : mêmes résultats, même ordre.
"""

import time

from django.conf import settings
from django.db import connection

from core.errors import ApiError
from core.presenter import card_queryset, cards, paged
from core.text import escape_like, normalize_search
from core.visibility import RUNNING_PROMOTIONS_CTE, RUNNING_PROMOTIONS_JOIN


# Tris et états acceptés dans l'adresse (?sort=…, ?condition=…).
SORTS = ('recent', 'price_asc', 'price_desc', 'discount', 'rating', 'popular')
CONDITIONS = ('NEW', 'LIKE_NEW', 'REFURBISHED', 'USED_GOOD', 'USED_FAIR')

# Tri « mieux notés » : une annonce avec 1 seul avis 5/5 ne doit pas passer devant une annonce
# avec 40 avis à 4,8. On fait comme si chaque annonce avait déjà 3 avis à 3,5 (moyenne bayésienne).
RATING_PRIOR_MEAN = 3.5
RATING_PRIOR_WEIGHT = 3

# Le nombre total de résultats coûte cher à calculer : on le garde 30 s en mémoire (500 recherches max).
COUNT_TTL = 30.0
COUNT_CACHE_MAX = 500
_count_cache: dict[str, tuple[int, float]] = {}


def search(q: dict):
    """q : paramètres déjà validés (voir catalog.params.catalog_query)."""
    page, page_size = q['page'], q['pageSize']
    skip = (page - 1) * page_size
    if skip > settings.PAGINATION_MAX_OFFSET:
        raise ApiError(400, 'Page trop éloignée : affinez votre recherche avec les filtres.')

    where = [
        "p.status = 'PUBLISHED'",
        "p.moderation = 'APPROVED'",
        'p."removedAt" IS NULL',
        "s.status = 'ACTIVE'",
        "p.availability <> 'WITHDRAWN'",
    ]
    params: list = []
    text_params: list = []
    text_cte = None

    if q.get('q'):
        normalized = normalize_search(q['q'])
        tokens = [t for t in normalized.split(' ') if t][:8]
        if tokens:
            all_tokens = ' AND '.join(['"searchText" ILIKE %s'] * len(tokens))
            text_params = ['%' + escape_like(t) + '%' for t in tokens] + ['%' + escape_like(normalized.replace(' ', '')) + '%']
            text_cte = f'text_matches AS MATERIALIZED (SELECT id FROM "Product" WHERE ({all_tokens}) OR "searchText" ILIKE %s)'

    if q.get('brand'):
        where.append(f"b.slug IN ({', '.join(['%s'] * len(q['brand']))})")
        params += q['brand']
    if q.get('category'):
        where.append('''p."categoryId" IN (
            SELECT c.id FROM "Category" c WHERE c.slug = %s
            OR c."parentId" IN (SELECT c2.id FROM "Category" c2 WHERE c2.slug = %s))''')
        params += [q['category'], q['category']]
    if q.get('shop'):
        where.append('s.slug = %s')
        params.append(q['shop'])
    if q.get('condition'):
        where.append(f"p.condition::text IN ({', '.join(['%s'] * len(q['condition']))})")
        params += q['condition']
    if q.get('storage'):
        where.append(f'''p."storageGb" IN ({', '.join(['%s'] * len(q['storage']))})''')
        params += q['storage']
    if q.get('ram'):
        where.append(f'''p."ramGb" IN ({', '.join(['%s'] * len(q['ram']))})''')
        params += q['ram']
    if q.get('available'):
        where.append("p.availability = 'AVAILABLE'")
    if q.get('promo'):
        where.append('pr."promoPrice" IS NOT NULL')
    if q.get('minPrice') is not None:
        where.append('COALESCE(pr."promoPrice", p.price) >= %s')
        params.append(q['minPrice'])
    if q.get('maxPrice') is not None:
        where.append('COALESCE(pr."promoPrice", p.price) <= %s')
        params.append(q['maxPrice'])
    if q.get('minRating') is not None:
        where.append('p."ratingCount" > 0 AND p."ratingAvg" >= %s')
        params.append(q['minRating'])

    sort = q['sort']
    order_by, order_params = {
        'recent': ('p."publishedAt" DESC NULLS LAST', []),
        'price_asc': ('COALESCE(pr."promoPrice", p.price) ASC', []),
        'price_desc': ('COALESCE(pr."promoPrice", p.price) DESC', []),
        'discount': ('''(CASE WHEN pr."promoPrice" IS NULL THEN 0
            ELSE (pr."referencePrice" - pr."promoPrice")::float / pr."referencePrice" END) DESC, p."publishedAt" DESC''', []),
        'rating': ('''((p."ratingAvg" * p."ratingCount" + %s) / (p."ratingCount" + %s)) DESC, p."ratingCount" DESC''',
                   [RATING_PRIOR_MEAN * RATING_PRIOR_WEIGHT, RATING_PRIOR_WEIGHT]),
        'popular': ('(p."viewCount" + 5 * p."whatsappClicks") DESC, p."publishedAt" DESC', []),
    }[sort]

    # La jointure des promotions n'est faite que si un filtre ou un tri porte sur le prix courant.
    needs_promo = bool(q.get('promo')) or q.get('minPrice') is not None or q.get('maxPrice') is not None or sort in ('price_asc', 'price_desc', 'discount')
    ctes = [c for c in (RUNNING_PROMOTIONS_CTE if needs_promo else None, text_cte) if c]
    with_sql = ('WITH ' + ', '.join(ctes)) if ctes else ''
    from_sql = f'''
      FROM "Product" p
      {'JOIN text_matches tm ON tm.id = p.id' if text_cte else ''}
      JOIN "Shop" s ON s.id = p."shopId"
      {'JOIN "Brand" b ON b.id = p."brandId"' if q.get('brand') else ''}
      {RUNNING_PROMOTIONS_JOIN if needs_promo else ''}
      WHERE {' AND '.join(where)}'''

    base_params = text_params + params
    with connection.cursor() as cur:
        # Les annonces disponibles passent toujours avant les annonces indisponibles.
        cur.execute(
            f"{with_sql} SELECT p.id {from_sql} ORDER BY (p.availability = 'AVAILABLE') DESC, {order_by}, p.id LIMIT %s OFFSET %s",
            base_params + order_params + [page_size, skip],
        )
        ids = [r[0] for r in cur.fetchall()]

        # Décompte mis en cache 30 s : « 85 714 téléphones » n'a pas besoin d'être exact à la seconde.
        count_key = repr(sorted((k, v) for k, v in q.items() if k not in ('page', 'pageSize', 'sort')))
        cached = _count_cache.get(count_key)
        if cached and time.monotonic() - cached[1] < COUNT_TTL:
            total = cached[0]
        else:
            cur.execute(f'{with_sql} SELECT COUNT(*) {from_sql}', base_params)
            total = cur.fetchone()[0]
            if len(_count_cache) >= COUNT_CACHE_MAX:
                _count_cache.pop(next(iter(_count_cache)))
            _count_cache[count_key] = (total, time.monotonic())

    by_id = {p.id: p for p in card_queryset().filter(id__in=ids)}
    ordered = [by_id[i] for i in ids if i in by_id]
    return paged(cards(ordered), total, page, page_size)
