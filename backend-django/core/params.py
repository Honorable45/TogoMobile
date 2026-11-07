"""
Lecture des paramètres d'adresse (?page=2&pageSize=24…), commune à toutes les routes.
Règles identiques à l'API Node : paramètre inconnu refusé, première erreur en message,
détail champ par champ dans « errors ».
"""

from .errors import ApiError


def csv_list(value):
    """« apple,samsung » → ['apple', 'samsung'] ; vide → None."""
    if value in (None, ''):
        return None
    return [v.strip() for v in value.split(',') if v.strip()] or None


def number(errors, name, value, lo=None, hi=None, number=int):
    """Nombre entre lo et hi ; sinon l'erreur est notée dans `errors` (la requête sera refusée)."""
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


# Paramètres de pagination, acceptés partout.
PAGE_FIELDS = {'page', 'pageSize'}


def page_query(qp, errors=None, allowed=PAGE_FIELDS):
    """Page (1 à 1000) et taille de page (1 à 60, 24 par défaut)."""
    errors = {} if errors is None else errors
    if allowed is not None:
        reject_unknown(qp, allowed, errors)
    page = number(errors, 'page', qp.get('page'), 1, 1000) or 1
    size = number(errors, 'pageSize', qp.get('pageSize'), 1, 60) or 24
    return page, size, errors
