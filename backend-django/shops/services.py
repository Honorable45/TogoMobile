"""Boutiques publiques, identiques à backend/src/shops/shops.service.ts (partie « Public »)."""

from django.db.models import Count, Q

from core.errors import ApiError
from core.models import Product, Shop
from core.presenter import iso, paged, window
from core.storage import public_url
from core.visibility import listed_product_q

VISIBLE = ('ACTIVE', 'CLOSED')


def available_count():
    """Nombre d'annonces listées et disponibles, par boutique (équivalent du _count Prisma)."""
    return Count('products', filter=listed_product_q('products__') & Q(products__availability='AVAILABLE'))


def public_card(s: Shop, product_count: int):
    return {
        'id': s.id,
        'name': s.name,
        'slug': s.slug,
        'logoUrl': public_url(s.logo_key),
        'city': s.city,
        'district': s.district,
        'description': s.description,
        'ratingAvg': s.rating_avg,
        'ratingCount': s.rating_count,
        'identityVerified': s.identity_verified_at is not None,
        'productCount': product_count,
    }


ORDER = {
    'rating': ('-rating_avg', '-rating_count'),
    'name': ('name',),
}


def shop_list(q: dict):
    qs = Shop.objects.filter(status='ACTIVE')
    if q['q']:
        qs = qs.filter(name__icontains=q['q'])
    if q['city']:
        qs = qs.filter(city__iexact=q['city'])
    rows = qs.order_by(*ORDER.get(q['sort'], ('-validated_at',))).annotate(n=available_count())[window(q['page'], q['pageSize'])]
    return paged([public_card(s, s.n) for s in rows], qs.count(), q['page'], q['pageSize'])


def public_shop(slug: str):
    s = Shop.objects.filter(slug=slug, status__in=VISIBLE).first()
    if not s:
        raise ApiError(404, "Cette boutique n'existe pas ou n'est pas disponible.")
    count = (
        Product.objects.filter(listed_product_q(), shop_id=s.id, availability='AVAILABLE').count() if s.status == 'ACTIVE' else 0
    )
    # Données publiques uniquement : ni propriétaire, ni modifications en attente, ni motifs internes.
    return {
        **public_card(s, count),
        'address': s.address,
        'phone': s.phone,
        'whatsapp': s.whatsapp,
        'socialLinks': s.social_links,
        'openingHours': s.opening_hours,
        'status': s.status,
        'validatedAt': iso(s.validated_at),
        'isDemo': s.is_demo,
        'createdAt': iso(s.created_at),
    }
