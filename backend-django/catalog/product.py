"""
Fiche d'une annonce : détail, annonces similaires, lien WhatsApp et compteur de vues.
"""

from urllib.parse import quote
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import connection, transaction

from core.errors import ApiError
from core.models import Product
from core.presenter import card_queryset, cards, iso, promotion_view, running_promotions
from core.storage import public_url
from core.visibility import listed_product_q, public_product_q


# Fuseau du Togo, pour les dates écrites dans le message WhatsApp.
LOME = ZoneInfo('Africa/Lome')
# Caractères laissés tels quels par encodeURIComponent (JavaScript) : liens identiques à l'API Node.
JS_URI_SAFE = "-_.!~*'()"


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
        f'Bonjour {p.shop.name}, je suis intéressé(e) par ce téléphone vu sur bonplan :',
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
