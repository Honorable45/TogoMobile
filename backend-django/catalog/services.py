"""
Catalogue public : recherche, fiche, annonces similaires, accueil, avis, suivi des vues et clics WhatsApp.
Transcription de backend/src/catalog/*.ts et backend/src/reviews/reviews.service.ts (partie publique).
"""

import time
from urllib.parse import quote
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import connection, transaction
from django.db.models import Count, Q
from django.utils import timezone

from core.errors import ApiError
from core.models import Brand, HeroAd, Product, Promotion, Review, Shop
from core.presenter import card, card_queryset, cards, iso, paged, promotion_view, running_promotions
from core.storage import public_url
from core.text import escape_like, normalize_search
from core.visibility import (
    RUNNING_PROMOTIONS_CTE,
    RUNNING_PROMOTIONS_JOIN,
    listed_product_q,
    public_product_q,
    running_promotion_q,
)

SORTS = ('recent', 'price_asc', 'price_desc', 'discount', 'rating', 'popular')
CONDITIONS = ('NEW', 'LIKE_NEW', 'REFURBISHED', 'USED_GOOD', 'USED_FAIR')
RATING_PRIOR_MEAN = 3.5
RATING_PRIOR_WEIGHT = 3
COUNT_TTL = 30.0
COUNT_CACHE_MAX = 500
_count_cache: dict[str, tuple[int, float]] = {}
LOME = ZoneInfo('Africa/Lome')
# Caractères laissés tels quels par encodeURIComponent (JavaScript) : liens identiques à l'API Node.
JS_URI_SAFE = "-_.!~*'()"


# ─── Recherche ──────────────────────────────────────────────────────────────


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


# ─── Fiche et annonces similaires ───────────────────────────────────────────


def detail(slug: str):
    p = (
        Product.objects.filter(public_product_q(), slug=slug)
        .select_related('brand', 'category', 'shop')
        .first()
    )
    if not p:
        raise ApiError(404, "Cette annonce n'existe pas ou n'est plus disponible.")
    media = list(p.media.filter(status='READY').order_by('-is_primary', 'position'))
    promo = running_promotions([p.id]).get(p.id)
    product_count = Product.objects.filter(listed_product_q(), shop_id=p.shop_id).count()
    primary = next((m for m in media if m.is_primary and m.type == 'IMAGE'), None)
    s = p.shop

    return {
        'id': p.id,
        'slug': p.slug,
        'reference': p.reference,
        'title': p.title,
        'model': p.model,
        'brand': {'name': p.brand.name, 'slug': p.brand.slug},
        'category': {'name': p.category.name, 'slug': p.category.slug} if p.category else None,
        'condition': p.condition,
        'availability': p.availability,
        'orderable': p.availability == 'AVAILABLE',
        'storageGb': p.storage_gb,
        'ramGb': p.ram_gb,
        'color': p.color,
        'warranty': p.warranty,
        'accessories': p.accessories,
        'defects': p.defects,
        'description': p.description,
        'specs': p.specs,
        'price': p.price,
        'currentPrice': promo.promo_price if promo else p.price,
        'promotion': promotion_view(promo) if promo else None,
        'ratingAvg': p.rating_avg,
        'ratingCount': p.rating_count,
        'publishedAt': iso(p.published_at),
        'updatedAt': iso(p.updated_at),
        'isDemo': p.is_demo,
        'image': {'url': public_url(primary.key), 'thumbUrl': public_url(primary.thumb_key)} if primary else None,
        'media': [
            {
                'id': m.id,
                'type': m.type,
                'url': public_url(m.key),
                'mediumUrl': public_url(m.medium_key or m.key),
                'thumbUrl': public_url(m.thumb_key or m.poster_key),
                'posterUrl': public_url(m.poster_key),
                'width': m.width,
                'height': m.height,
                'isPrimary': m.is_primary,
            }
            for m in media
        ],
        'shop': {
            'id': s.id,
            'name': s.name,
            'slug': s.slug,
            'logoUrl': public_url(s.logo_key),
            'city': s.city,
            'district': s.district,
            'ratingAvg': s.rating_avg,
            'ratingCount': s.rating_count,
            'productCount': product_count,
            'validatedAt': iso(s.validated_at),
            'identityVerified': s.identity_verified_at is not None,
        },
    }


def similar(slug: str):
    p = Product.objects.filter(public_product_q(), slug=slug).values('id', 'brand_id').first()
    if not p:
        return []
    items = (
        card_queryset()
        .filter(listed_product_q(), brand_id=p['brand_id'], availability='AVAILABLE')
        .exclude(id=p['id'])
        .order_by('-published_at')[:8]
    )
    return cards(items)


# ─── Clics WhatsApp et vues ─────────────────────────────────────────────────


def _fcfa(n: int) -> str:
    return f'{n:,}'.replace(',', ' ') + ' FCFA'


def _lome_date(d) -> str:
    months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
    d = d.astimezone(LOME)
    return f'{d.day} {months[d.month - 1]}'


def _track(product_id: str, field: str):
    total, col = ('"viewCount"', 'views') if field == 'views' else ('"whatsappClicks"', '"whatsappClicks"')
    with transaction.atomic(), connection.cursor() as cur:
        cur.execute(f'UPDATE "Product" SET {total} = {total} + 1 WHERE id = %s', [product_id])
        cur.execute(
            f'''INSERT INTO "ProductDailyStat" ("productId", day, {col})
                VALUES (%s, (now() AT TIME ZONE 'Africa/Lome')::date, 1)
                ON CONFLICT ("productId", day) DO UPDATE SET {col} = "ProductDailyStat".{col} + 1''',
            [product_id],
        )


def whatsapp(product_id: str):
    """Compose le message avec le prix affiché à cet instant et compte le clic (un clic n'est pas une vente)."""
    p = Product.objects.filter(public_product_q(), id=product_id).select_related('shop').first()
    if not p:
        raise ApiError(404, "Cette annonce n'est plus disponible.")
    if p.availability == 'WITHDRAWN':
        raise ApiError(410, 'Ce téléphone a été retiré de la vente.')

    promo = running_promotions([p.id]).get(p.id)
    link = f'{settings.WEB_URL}/produits/{p.slug}'
    price_line = (
        f"Prix affiché : {_fcfa(promo.promo_price)} (promotion jusqu'au {_lome_date(promo.ends_at)}, au lieu de {_fcfa(promo.reference_price)})"
        if promo
        else f'Prix affiché : {_fcfa(p.price)}'
    )
    question = 'Est-il toujours disponible ?' if p.availability == 'AVAILABLE' else 'Pouvez-vous me dire quand il sera de nouveau disponible ?'
    message = '\n'.join([
        f'Bonjour {p.shop.name}, je suis intéressé(e) par ce téléphone vu sur TogoMobile :',
        p.title,
        f'Référence : {p.reference}',
        price_line,
        link,
        question,
    ])
    _track(p.id, 'whatsappClicks')
    digits = ''.join(c for c in p.shop.whatsapp if c.isdigit())
    text = quote(message, safe=JS_URI_SAFE)
    return {'url': f'https://wa.me/{digits}?text={text}', 'message': message, 'price': promo.promo_price if promo else p.price}


def view(product_id: str):
    if Product.objects.filter(public_product_q(), id=product_id).exists():
        _track(product_id, 'views')


# ─── Accueil ────────────────────────────────────────────────────────────────


def _hero_ads(now):
    rows = (
        HeroAd.objects.filter(is_active=True)
        .filter(Q(starts_at__isnull=True) | Q(starts_at__lte=now))
        .filter(Q(ends_at__isnull=True) | Q(ends_at__gt=now))
        .order_by('sort_order', '-created_at')[:6]
    )
    return [
        {
            'id': r.id,
            'title': r.title,
            'subtitle': r.subtitle,
            'advertiser': r.advertiser,
            'linkUrl': r.link_url,
            'imageUrl': public_url(r.image_key),
            'mobileImageUrl': public_url(r.mobile_image_key),
            'width': r.width,
            'height': r.height,
        }
        for r in rows
    ]


def home():
    now = timezone.now()
    brands = list(
        Brand.objects.filter(is_active=True, featured=True).order_by('sort_order', 'name').values('id', 'name', 'slug', 'logo_url')
    )
    newest = card_queryset().filter(listed_product_q(), availability='AVAILABLE').order_by('-published_at')[:8]
    popular = (
        card_queryset()
        .filter(listed_product_q(), availability='AVAILABLE', view_count__gt=0)
        .order_by('-whatsapp_clicks', '-view_count')[:8]
    )
    # Départage stable par identifiant quand plusieurs promotions finissent au même instant.
    promo_rows = list(Promotion.objects.filter(running_promotion_q(now)).order_by('ends_at', 'id')[:8])
    promo_products = {p.id: p for p in card_queryset().filter(id__in=[pr.product_id for pr in promo_rows])}
    shops = (
        Shop.objects.filter(status='ACTIVE')
        .order_by('-validated_at')
        .annotate(n=Count('products', filter=listed_product_q('products__') & Q(products__availability='AVAILABLE')))[:6]
    )
    return {
        'heroAds': _hero_ads(now),
        'brands': [{'id': b['id'], 'name': b['name'], 'slug': b['slug'], 'logoUrl': b['logo_url']} for b in brands],
        'newest': cards(newest),
        'popular': cards(popular),
        'promotions': [card(promo_products[pr.product_id], pr) for pr in promo_rows if pr.product_id in promo_products],
        'shops': [
            {
                'id': s.id,
                'name': s.name,
                'slug': s.slug,
                'logoUrl': public_url(s.logo_key),
                'city': s.city,
                'ratingAvg': s.rating_avg,
                'ratingCount': s.rating_count,
                'identityVerified': s.identity_verified_at is not None,
                'productCount': s.n,
            }
            for s in shops
        ],
    }


# ─── Avis publics ───────────────────────────────────────────────────────────

PUBLIC_REVIEW = Q(status='PUBLISHED', verification='VERIFIED_PURCHASE')


def display_name(name: str) -> str:
    """« Kossi Mensah » → « Kossi M. » : l'identité complète de l'auteur n'est jamais publiée."""
    parts = name.split()
    if len(parts) <= 1:
        return parts[0] if parts else ''
    return f'{parts[0]} {parts[-1][0].upper()}.'


def _reviews_page(where: Q, page: int, page_size: int, with_product: bool):
    skip = (page - 1) * page_size
    if skip > settings.PAGINATION_MAX_OFFSET:
        raise ApiError(400, 'Page trop éloignée : affinez votre recherche avec les filtres.')
    full = Review.objects.filter(where & PUBLIC_REVIEW)
    rows = full.select_related('author', 'product').order_by('-created_at')[skip:skip + page_size]
    groups = dict(full.values_list('rating').annotate(n=Count('id')).order_by())
    distribution = [{'rating': r, 'count': groups.get(r, 0)} for r in (5, 4, 3, 2, 1)]
    count = sum(d['count'] for d in distribution)
    avg = sum(d['rating'] * d['count'] for d in distribution) / count if count else 0
    items = []
    for r in rows:
        item = {
            'id': r.id,
            'rating': r.rating,
            'comment': r.comment,
            'authorName': display_name(r.author.name),
            'createdAt': iso(r.created_at),
            'verifiedPurchase': r.verification == 'VERIFIED_PURCHASE',
            'isDemo': r.is_demo,
        }
        if with_product:
            item['product'] = {'title': r.product.title, 'slug': r.product.slug}
        items.append(item)
    summary = {'average': round(avg * 10) / 10, 'count': count, 'distribution': distribution}
    return {'summary': summary, **paged(items, full.count(), page, page_size)}


def product_reviews(slug: str, page: int, page_size: int):
    p = Product.objects.filter(public_product_q(), slug=slug).values('id').first()
    if not p:
        raise ApiError(404, 'Annonce introuvable.')
    return _reviews_page(Q(product_id=p['id']), page, page_size, False)


def shop_reviews(slug: str, page: int, page_size: int):
    s = Shop.objects.filter(slug=slug, status__in=['ACTIVE', 'CLOSED']).values('id').first()
    if not s:
        raise ApiError(404, 'Boutique introuvable.')
    return _reviews_page(Q(shop_id=s['id']), page, page_size, True)
