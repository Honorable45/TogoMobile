"""
Règles de visibilité publique (source unique), identiques à backend/src/common/visibility.ts.
"""

from django.db.models import Q
from django.utils import timezone


def public_product_q(prefix: str = '') -> Q:
    """Annonce consultable : publiée, approuvée, non retirée par l'administration, boutique active."""
    return Q(**{
        f'{prefix}status': 'PUBLISHED',
        f'{prefix}moderation': 'APPROVED',
        f'{prefix}removed_at__isnull': True,
        f'{prefix}shop__status': 'ACTIVE',
    })


def listed_product_q(prefix: str = '') -> Q:
    """Annonce listée dans les catalogues : consultable et non « retirée de la vente »."""
    return public_product_q(prefix) & ~Q(**{f'{prefix}availability': 'WITHDRAWN'})


def running_promotion_q(now=None) -> Q:
    """Promotion appliquée à l'instant `now`, sur une annonce publique et disponible."""
    now = now or timezone.now()
    return (
        Q(status='ACTIVE', starts_at__lte=now, ends_at__gt=now)
        & public_product_q('product__')
        & Q(product__availability='AVAILABLE')
    )


# Équivalent SQL pour le moteur de recherche (alias produit : p, promotion : pr).
RUNNING_PROMOTIONS_CTE = '''
  running_promotions AS (
    SELECT DISTINCT ON (x."productId") x."productId", x."promoPrice", x."referencePrice"
    FROM "Promotion" x
    WHERE x.status = 'ACTIVE' AND x."startsAt" <= now() AND x."endsAt" > now()
    ORDER BY x."productId", x."promoPrice" ASC
  )'''
RUNNING_PROMOTIONS_JOIN = '''
  LEFT JOIN running_promotions pr ON pr."productId" = p.id AND p.availability = 'AVAILABLE\''''
