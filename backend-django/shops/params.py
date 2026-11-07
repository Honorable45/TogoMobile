"""Paramètres de la liste des boutiques (?q=, ?city=, ?sort=), mêmes règles que shops.controller.ts côté Node."""

from core.params import PAGE_FIELDS, fail, page_query

# Tris possibles : récemment validées, mieux notées, ordre alphabétique.
SHOP_SORTS = ('recent', 'rating', 'name')


def shop_list_query(qp):
    page, size, errors = page_query(qp, allowed=PAGE_FIELDS | {'q', 'city', 'sort'})
    q = qp.get('q') or None
    city = qp.get('city') or None
    if q and len(q) > 80:
        errors['q'] = 'q doit faire au plus 80 caractères.'
    if city and len(city) > 60:
        errors['city'] = 'city doit faire au plus 60 caractères.'
    sort = qp.get('sort') or None
    if sort and sort not in SHOP_SORTS:
        errors['sort'] = 'Tri inconnu.'
    fail(errors)
    return {'page': page, 'pageSize': size, 'q': q, 'city': city, 'sort': sort}
