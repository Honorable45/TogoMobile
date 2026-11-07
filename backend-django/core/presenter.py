"""
Représentations publiques des produits (même JSON que backend/src/products/product-presenter.ts).
Le prix courant et la promotion sont toujours calculés ici, avec la même règle, pour toutes les pages.
"""

from datetime import UTC

from django.db.models import Prefetch

from .models import Product, ProductMedia, Promotion
from .storage import public_url
from .visibility import running_promotion_q


def iso(dt):
    """Dates au format JavaScript (toISOString) : 2026-11-07T10:00:00.000Z, toujours en UTC."""
    if dt is None:
        return None
    dt = dt.astimezone(UTC)
    return dt.strftime('%Y-%m-%dT%H:%M:%S.') + f'{dt.microsecond // 1000:03d}Z'


def discount_percent(reference_price: int, promo_price: int) -> int:
    if reference_price <= 0 or promo_price >= reference_price:
        return 0
    return int((reference_price - promo_price) / reference_price * 100)


def promotion_view(p: Promotion):
    return {
        'id': p.id,
        'promoPrice': p.promo_price,
        'referencePrice': p.reference_price,
        'discountPercent': discount_percent(p.reference_price, p.promo_price),
        'startsAt': iso(p.starts_at),
        'endsAt': iso(p.ends_at),
        'conditions': p.conditions,
    }


def card_queryset():
    """Équivalent de CARD_INCLUDE : marque, boutique et photo principale prête."""
    return Product.objects.select_related('brand', 'shop').prefetch_related(
        Prefetch('media', queryset=ProductMedia.objects.filter(is_primary=True, status='READY'), to_attr='primary_media')
    )


def running_promotions(product_ids) -> dict:
    """Promotion en cours la plus avantageuse, par produit."""
    ids = list(product_ids)
    if not ids:
        return {}
    out = {}
    for p in Promotion.objects.filter(running_promotion_q(), product_id__in=ids).order_by('promo_price'):
        out.setdefault(p.product_id, p)
    return out


def card(p: Product, promo: Promotion | None = None):
    media = getattr(p, 'primary_media', None)
    img = media[0] if media else None
    return {
        'id': p.id,
        'slug': p.slug,
        'reference': p.reference,
        'title': p.title,
        'model': p.model,
        'brand': {'name': p.brand.name, 'slug': p.brand.slug},
        'condition': p.condition,
        'availability': p.availability,
        'storageGb': p.storage_gb,
        'ramGb': p.ram_gb,
        'price': p.price,
        'currentPrice': promo.promo_price if promo else p.price,
        'promotion': promotion_view(promo) if promo else None,
        'image': {
            'url': public_url(img.key),
            'mediumUrl': public_url(img.medium_key or img.key),
            'thumbUrl': public_url(img.thumb_key or img.key),
            'width': img.width,
            'height': img.height,
        } if img else None,
        'shop': {
            'name': p.shop.name,
            'slug': p.shop.slug,
            'city': p.shop.city,
            'logoUrl': public_url(p.shop.logo_key),
            'identityVerified': p.shop.identity_verified_at is not None,
        },
        'ratingAvg': p.rating_avg,
        'ratingCount': p.rating_count,
        'isDemo': p.is_demo,
    }


def cards(products):
    products = list(products)
    promos = running_promotions(p.id for p in products)
    return [card(p, promos.get(p.id)) for p in products]


def paged(items, total: int, page: int, page_size: int):
    return {
        'items': items,
        'page': page,
        'pageSize': page_size,
        'total': total,
        'totalPages': max(1, -(-total // page_size)),
    }
