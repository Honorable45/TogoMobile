"""
Favoris : compare l'API Node (référence) et l'API Django sur la même base, avec le même compte.
Les ajouts et retraits sont faits tantôt par une API, tantôt par l'autre, puis les listes sont
comparées des deux côtés (même session, mêmes données).
Usage : python scripts/compare_favorites.py [http://localhost:4000] [http://localhost:8000]
"""

import json
import secrets
import sys

from compare_api import ALIAS, diff
from compare_auth import call, check, results

NODE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4000'
DJANGO = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:8000'
APIS = (('Node', NODE), ('Django', DJANGO))


def both(label, method, path, tok, body=None):
    """Même requête des deux côtés : même statut, même corps (ou mêmes champs en erreur)."""
    (sa, a, _), (sb, b, _) = (call(base, method, path, body, tok) for _, base in APIS)
    if ALIAS:
        b = json.loads(json.dumps(b).replace(ALIAS[0], ALIAS[1]))
    problems = [f'statut {sa} ≠ {sb}'] if sa != sb else []
    if sa == sb and sa < 400:
        problems += diff(a, b)
    elif sa == sb and sa == 400:
        if set((a or {}).get('errors') or {}) != set((b or {}).get('errors') or {}):
            problems.append(f'champs {a} ≠ {b}')
    elif sa == sb and (a or {}).get('message') != (b or {}).get('message'):
        problems.append(f"message {a.get('message')!r} ≠ {b.get('message')!r}")
    check(label, not problems, '; '.join(problems[:6]))
    return sa, a


def main():
    _, home, _ = call(NODE, 'GET', '/home')
    products = [p['id'] for p in home['newest']][:4]
    shops = [s['id'] for s in home['shops']][:3]

    pw = 'Essai' + secrets.token_hex(4) + '7'
    s, _, tok = call(DJANGO, 'POST', '/auth/register', {'name': 'Essai Favoris', 'email': f'fav-{secrets.token_hex(4)}@exemple.tg', 'password': pw})
    check('compte de test créé', s == 201 and tok)

    both('sans connexion : 401', 'PUT', f'/me/favorites/products/{products[0]}', None)
    both('liste vide', 'GET', '/me/favorites/products', tok)

    # Ajouts alternés entre les deux API (la même session sert des deux côtés).
    for i, pid in enumerate(products[:3]):
        name, base = APIS[i % 2]
        s, body, _ = call(base, 'PUT', f'/me/favorites/products/{pid}', None, tok)
        check(f'ajout annonce {i + 1} via {name}', s == 200 and body == {'favorite': True}, f'{s} {body}')
    both('ajout en double (idempotent)', 'PUT', f'/me/favorites/products/{products[0]}', tok)
    for i, sid in enumerate(shops[:2]):
        name, base = APIS[(i + 1) % 2]
        s, body, _ = call(base, 'PUT', f'/me/favorites/shops/{sid}', None, tok)
        check(f'ajout boutique {i + 1} via {name}', s == 200 and body == {'favorite': True}, f'{s} {body}')

    both('annonce inconnue : 404', 'PUT', '/me/favorites/products/n-existe-pas', tok)
    both('boutique inconnue : 404', 'PUT', '/me/favorites/shops/n-existe-pas', tok)
    both('identifiants favoris', 'GET', '/me/favorites/ids', tok)
    both('liste des annonces favorites', 'GET', '/me/favorites/products', tok)
    both('annonces, page 2 de 2', 'GET', '/me/favorites/products?page=2&pageSize=2', tok)
    both('liste des boutiques favorites', 'GET', '/me/favorites/shops', tok)
    both('paramètre inconnu : 400', 'GET', '/me/favorites/shops?foo=1', tok)
    both('page trop grande : 400', 'GET', '/me/favorites/products?pageSize=500', tok)

    # Retrait par une API, constaté par l'autre.
    s, body, _ = call(NODE, 'DELETE', f'/me/favorites/products/{products[1]}', None, tok)
    check('retrait via Node', s == 200 and body == {'favorite': False}, f'{s} {body}')
    s, body, _ = call(DJANGO, 'DELETE', f'/me/favorites/shops/{shops[0]}', None, tok)
    check('retrait via Django', s == 200 and body == {'favorite': False}, f'{s} {body}')
    both('retrait déjà fait (idempotent)', 'DELETE', f'/me/favorites/shops/{shops[0]}', tok)
    _, ids = both('identifiants après retraits', 'GET', '/me/favorites/ids', tok)
    check('retraits bien appliqués', products[1] not in ids['products'] and shops[0] not in ids['shops'], str(ids))

    print(f'\n{sum(results)}/{len(results)} vérifications réussies')
    sys.exit(0 if all(results) else 1)


if __name__ == '__main__':
    main()
