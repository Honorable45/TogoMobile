"""Paramètres de la recherche du catalogue (?q=, ?brand=, ?sort=…), mêmes règles que catalog.dto.ts côté Node."""

from core.params import PAGE_FIELDS, csv_list, fail, number, page_query

from .search import CONDITIONS, SORTS

# Tous les paramètres acceptés par /catalog/products ; les autres sont refusés.
CATALOG_FIELDS = PAGE_FIELDS | {
    'q', 'brand', 'category', 'shop', 'minPrice', 'maxPrice', 'condition', 'storage', 'ram', 'available', 'promo', 'minRating', 'sort',
}


def catalog_query(qp):
    page, size, errors = page_query(qp, allowed=CATALOG_FIELDS)
    q = (qp.get('q') or '').strip() or None
    if q and len(q) > 100:
        errors['q'] = 'q doit faire au plus 100 caractères.'
    condition = csv_list(qp.get('condition'))
    if condition and any(c not in CONDITIONS for c in condition):
        errors['condition'] = 'État inconnu.'
    ints = {}
    for name in ('storage', 'ram'):
        raw = csv_list(qp.get(name))
        try:
            ints[name] = [int(v) for v in raw] if raw else None
        except ValueError:
            errors[name] = f'{name} doit être une liste de nombres.'
    sort = qp.get('sort') or 'recent'
    if sort not in SORTS:
        errors['sort'] = 'Tri inconnu.'
    for name in ('category', 'shop'):
        if len(qp.get(name) or '') > 80:
            errors[name] = f'{name} doit faire au plus 80 caractères.'
    result = {
        'page': page,
        'pageSize': size,
        'q': q,
        'brand': csv_list(qp.get('brand')),
        'category': qp.get('category') or None,
        'shop': qp.get('shop') or None,
        'minPrice': number(errors, 'minPrice', qp.get('minPrice'), 0),
        'maxPrice': number(errors, 'maxPrice', qp.get('maxPrice'), 0),
        'condition': condition,
        'storage': ints.get('storage'),
        'ram': ints.get('ram'),
        'available': qp.get('available') in ('true', '1'),
        'promo': qp.get('promo') in ('true', '1'),
        'minRating': number(errors, 'minRating', qp.get('minRating'), 1, 5, float),
        'sort': sort,
    }
    fail(errors)
    return result
