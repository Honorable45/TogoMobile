"""
Avis publics (vérifiés) d'une annonce ou d'une boutique, avec la répartition des notes.
"""


from django.conf import settings
from django.db.models import Count, Q

from core.errors import ApiError
from core.models import Product, Review, Shop
from core.presenter import iso, paged
from core.visibility import public_product_q


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
