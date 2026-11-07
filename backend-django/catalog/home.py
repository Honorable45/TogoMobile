"""
Données de la page d'accueil en une seule requête : publicités, marques, nouveautés, promos, boutiques.
"""


from django.db.models import Count, Q
from django.utils import timezone

from core.models import Brand, HeroAd, Promotion, Shop
from core.presenter import card, card_queryset, cards
from core.storage import public_url
from core.visibility import listed_product_q, running_promotion_q


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
