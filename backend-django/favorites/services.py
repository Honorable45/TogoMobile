"""Favoris (annonces et boutiques), identiques à backend/src/favorites/favorites.module.ts."""

from core.errors import ApiError
from core.models import Product, ProductFavorite, Shop, ShopFavorite
from core.presenter import card_queryset, cards, iso, paged, window
from core.visibility import listed_product_q, public_product_q
from shops.services import VISIBLE, available_count, public_card


def ids(user_id: str):
    """Identifiants favoris de l'utilisateur, pour l'état des boutons dans l'interface."""
    return {
        'products': list(ProductFavorite.objects.filter(user_id=user_id).order_by('product_id').values_list('product_id', flat=True)[:1000]),
        'shops': list(ShopFavorite.objects.filter(user_id=user_id).order_by('shop_id').values_list('shop_id', flat=True)[:1000]),
    }


def add_product(user_id: str, product_id: str):
    if not Product.objects.filter(public_product_q(), id=product_id).exists():
        raise ApiError(404, 'Annonce introuvable.')
    # Idempotent : la clé primaire (userId, productId) empêche les doublons.
    ProductFavorite.objects.bulk_create([ProductFavorite(user_id=user_id, product_id=product_id)], ignore_conflicts=True)
    return {'favorite': True}


def remove_product(user_id: str, product_id: str):
    ProductFavorite.objects.filter(user_id=user_id, product_id=product_id).delete()
    return {'favorite': False}


def add_shop(user_id: str, shop_id: str):
    if not Shop.objects.filter(id=shop_id, status__in=VISIBLE).exists():
        raise ApiError(404, 'Boutique introuvable.')
    ShopFavorite.objects.bulk_create([ShopFavorite(user_id=user_id, shop_id=shop_id)], ignore_conflicts=True)
    return {'favorite': True}


def remove_shop(user_id: str, shop_id: str):
    ShopFavorite.objects.filter(user_id=user_id, shop_id=shop_id).delete()
    return {'favorite': False}


def products(user_id: str, page: int, page_size: int):
    # Les favoris dont l'annonce n'est plus publique sont conservés mais signalés comme indisponibles.
    qs = ProductFavorite.objects.filter(user_id=user_id)
    rows = list(qs.order_by('-created_at').values('product_id', 'created_at')[window(page, page_size)])
    pids = [r['product_id'] for r in rows]
    by_id = card_queryset().in_bulk(pids)
    listed = set(Product.objects.filter(listed_product_q(), id__in=pids).values_list('id', flat=True))
    present = [r for r in rows if r['product_id'] in by_id]
    items = [
        {**c, 'addedAt': iso(r['created_at']), 'listed': c['id'] in listed}
        for c, r in zip(cards(by_id[r['product_id']] for r in present), present)
    ]
    return paged(items, qs.count(), page, page_size)


def shops(user_id: str, page: int, page_size: int):
    qs = ShopFavorite.objects.filter(user_id=user_id, shop__status__in=VISIBLE)
    rows = list(qs.order_by('-created_at').values('shop_id', 'created_at')[window(page, page_size)])
    by_id = Shop.objects.annotate(n=available_count()).in_bulk([r['shop_id'] for r in rows])
    items = [
        {**public_card(by_id[r['shop_id']], by_id[r['shop_id']].n), 'status': by_id[r['shop_id']].status, 'addedAt': iso(r['created_at'])}
        for r in rows
        if r['shop_id'] in by_id
    ]
    return paged(items, qs.count(), page, page_size)
