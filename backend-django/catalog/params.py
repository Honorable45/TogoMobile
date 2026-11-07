"""Validation des paramètres de requête, mêmes règles que les DTO Node (catalog.dto.ts, pagination.ts)."""

from core.errors import ApiError

from .services import CONDITIONS, SORTS


def _csv(value):
    if value in (None, ''):
        return None
    return [v.strip() for v in value.split(',') if v.strip()] or None


def _int(errors, name, value, lo=None, hi=None, number=int):
    if value in (None, ''):
        return None
    try:
        n = number(value)
    except ValueError:
        errors[name] = f'{name} doit être un nombre.'
        return None
    if (lo is not None and n < lo) or (hi is not None and n > hi):
        errors[name] = f'{name} doit être compris entre {lo} et {hi}.' if hi is not None else f'{name} doit être supérieur ou égal à {lo}.'
    return n


def reject_unknown(qp, allowed, errors):
    """Comme le ValidationPipe Node (forbidNonWhitelisted) : tout paramètre inconnu est refusé."""
    for key in qp.keys():
        if key not in allowed:
            errors[key] = 'Champ non autorisé.'


def fail(errors):
    # Comme l'API Node : le premier problème en message, le détail par champ dans « errors ».
    if errors:
        raise ApiError(400, next(iter(errors.values())), errors)


PAGE_FIELDS = {'page', 'pageSize'}
CATALOG_FIELDS = PAGE_FIELDS | {
    'q', 'brand', 'category', 'shop', 'minPrice', 'maxPrice', 'condition', 'storage', 'ram', 'available', 'promo', 'minRating', 'sort',
}


def page_query(qp, errors=None, allowed=PAGE_FIELDS):
    errors = {} if errors is None else errors
    if allowed is not None:
        reject_unknown(qp, allowed, errors)
    page = _int(errors, 'page', qp.get('page'), 1, 1000) or 1
    size = _int(errors, 'pageSize', qp.get('pageSize'), 1, 60) or 24
    return page, size, errors


def catalog_query(qp):
    page, size, errors = page_query(qp, allowed=CATALOG_FIELDS)
    q = (qp.get('q') or '').strip() or None
    if q and len(q) > 100:
        errors['q'] = 'q doit faire au plus 100 caractères.'
    condition = _csv(qp.get('condition'))
    if condition and any(c not in CONDITIONS for c in condition):
        errors['condition'] = 'État inconnu.'
    ints = {}
    for name in ('storage', 'ram'):
        raw = _csv(qp.get(name))
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
        'brand': _csv(qp.get('brand')),
        'category': qp.get('category') or None,
        'shop': qp.get('shop') or None,
        'minPrice': _int(errors, 'minPrice', qp.get('minPrice'), 0),
        'maxPrice': _int(errors, 'maxPrice', qp.get('maxPrice'), 0),
        'condition': condition,
        'storage': ints.get('storage'),
        'ram': ints.get('ram'),
        'available': qp.get('available') in ('true', '1'),
        'promo': qp.get('promo') in ('true', '1'),
        'minRating': _int(errors, 'minRating', qp.get('minRating'), 1, 5, float),
        'sort': sort,
    }
    if errors:
        # Comme l'API Node : le premier problème en message, le détail par champ dans « errors ».
        raise ApiError(400, next(iter(errors.values())), errors)
    return result


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
