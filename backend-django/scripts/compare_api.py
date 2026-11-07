"""
Compare les réponses de l'API Node (référence) et de l'API Django sur les mêmes adresses.
Usage : python scripts/compare_api.py [http://localhost:4000] [http://localhost:8000]
"""

import json
import sys
import urllib.error
import urllib.request

NODE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4000'
DJANGO = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:8000'


def get(base, path):
    try:
        with urllib.request.urlopen(f'{base}/api/v1{path}', timeout=30) as r:
            return r.status, json.loads(r.read() or 'null')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or 'null')


def diff(a, b, path=''):
    if type(a) is not type(b) and not (isinstance(a, (int, float)) and isinstance(b, (int, float))):
        return [f'{path}: {a!r} ≠ {b!r}']
    if isinstance(a, dict):
        out = []
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                out.append(f'{path}.{k}: présent seulement côté {"Node" if k in a else "Django"}')
            else:
                out += diff(a[k], b[k], f'{path}.{k}')
        return out
    if isinstance(a, list):
        if len(a) != len(b):
            return [f'{path}: {len(a)} éléments ≠ {len(b)}']
        return [d for i, (x, y) in enumerate(zip(a, b)) for d in diff(x, y, f'{path}[{i}]')]
    return [] if a == b else [f'{path}: {a!r} ≠ {b!r}']


def normalize(path, body):
    """Accueil : les promotions qui finissent au même instant n'ont pas d'ordre garanti côté Node."""
    if path == '/home' and isinstance(body, dict):
        body['promotions'] = sorted(body.get('promotions') or [], key=lambda c: (c['promotion']['endsAt'], c['promotion']['id']))
    return body


def main():
    _, home = get(NODE, '/home')
    slug = (home.get('newest') or [{}])[0].get('slug', 'inconnu')
    shop = (home.get('shops') or [{}])[0].get('slug', 'inconnue')
    paths = [
        '/home',
        '/catalog/products',
        '/catalog/products?sort=price_asc',
        '/catalog/products?sort=price_desc&pageSize=5',
        '/catalog/products?sort=discount',
        '/catalog/products?sort=rating',
        '/catalog/products?sort=popular',
        '/catalog/products?q=samsung',
        '/catalog/products?q=iphone13',
        '/catalog/products?brand=apple,samsung',
        '/catalog/products?promo=true',
        '/catalog/products?condition=NEW&minPrice=50000&maxPrice=500000',
        '/catalog/products?category=telephones',
        f'/catalog/products?shop={shop}',
        '/catalog/products?page=2&pageSize=5',
        '/catalog/products?sort=inconnu',
        '/catalog/products?page=0&pageSize=500',
        '/catalog/products?minRating=4',
        '/catalog/products?storage=128,256&ram=8',
        '/catalog/products?available=true&sort=discount',
        f'/products/{slug}',
        f'/products/{slug}/similar',
        f'/products/{slug}/reviews',
        f'/shops/{shop}/reviews',
        '/products/n-existe-pas',
        '/products/n-existe-pas/similar',
    ]
    failures = 0
    for p in paths:
        (sa, a), (sb, b) = get(NODE, p), get(DJANGO, p)
        a, b = normalize(p, a), normalize(p, b)
        problems = ([f'statut {sa} ≠ {sb}'] if sa != sb else []) + (diff(a, b) if sa < 400 else [])
        # Erreurs de validation (400) : mêmes champs en cause ; le texte est en français côté Django.
        if sa == sb == 400 and set((a or {}).get('errors') or {}) != set((b or {}).get('errors') or {}):
            problems.append(f"champs {sorted((a or {}).get('errors') or {})} ≠ {sorted((b or {}).get('errors') or {})}")
        elif sa == sb and sa >= 400 and sa != 400 and (a or {}).get('message') != (b or {}).get('message'):
            problems.append(f"message {a.get('message')!r} ≠ {b.get('message')!r}")
        print(('OK   ' if not problems else 'ÉCART'), p)
        for d in problems[:8]:
            print('       ', d)
        failures += bool(problems)
    print(f'\n{len(paths) - failures}/{len(paths)} adresses identiques')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
