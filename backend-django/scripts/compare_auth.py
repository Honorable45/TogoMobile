"""
Vérifie la compatibilité des comptes entre l'API Node (référence) et l'API Django sur la même base :
inscription, connexion, sessions croisées (cookie ouvert d'un côté, utilisé de l'autre), erreurs.
Usage : python scripts/compare_auth.py [http://localhost:4000] [http://localhost:8000]
"""

import json
import secrets
import sys
import urllib.error
import urllib.request
from http.cookies import SimpleCookie

NODE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4000'
DJANGO = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:8000'
results = []


def call(base, method, path, body=None, token=None):
    req = urllib.request.Request(f'{base}/api/v1{path}', method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header('Content-Type', 'application/json')
    req.add_header('User-Agent', 'compare-auth')
    if token:
        req.add_header('Cookie', f'tm_session={token}')
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            status, raw, headers = r.status, r.read(), r.headers
    except urllib.error.HTTPError as e:
        status, raw, headers = e.code, e.read(), e.headers
    cookie = SimpleCookie()
    for h in headers.get_all('Set-Cookie') or []:
        cookie.load(h)
    tok = cookie['tm_session'].value if 'tm_session' in cookie else None
    return status, (json.loads(raw) if raw else None), tok


def check(label, ok, detail=''):
    ok = bool(ok)
    results.append(ok)
    print(('OK   ' if ok else 'ÉCHEC'), label, '' if ok else detail)


def same_shape(a, b):
    """Mêmes clés et mêmes valeurs, sauf identifiants et dates propres à chaque compte."""
    skip = {'id', 'createdAt', 'email', 'phone', 'name'}
    return {k: v for k, v in (a or {}).items() if k not in skip} == {k: v for k, v in (b or {}).items() if k not in skip} and set(a or {}) == set(b or {})


def main():
    pw = 'Essai' + secrets.token_hex(4) + '7'
    users = {}
    for name, base in (('Node', NODE), ('Django', DJANGO)):
        email = f'test-{name.lower()}-{secrets.token_hex(4)}@exemple.tg'
        s, body, tok = call(base, 'POST', '/auth/register', {'name': f'Essai {name}', 'email': email, 'password': pw})
        check(f'inscription {name} (201 + cookie)', s == 201 and tok, f'{s} {body}')
        users[name] = (email, body, tok)
    check('inscription : même réponse', same_shape(users['Node'][1], users['Django'][1]), f"{users['Node'][1]} / {users['Django'][1]}")

    # Sessions croisées : un cookie créé par une API est reconnu par l'autre.
    for owner, other_name, other in (('Node', 'Django', DJANGO), ('Django', 'Node', NODE)):
        s, body, _ = call(other, 'GET', '/auth/me', token=users[owner][2])
        check(f'session ouverte par {owner}, reconnue par {other_name}', s == 200 and body['email'] == users[owner][0], f'{s} {body}')

    # Connexion croisée : compte créé par l'une, connexion par l'autre (même empreinte de mot de passe).
    for owner, other_name, other in (('Node', 'Django', DJANGO), ('Django', 'Node', NODE)):
        s, body, tok = call(other, 'POST', '/auth/login', {'identifier': users[owner][0], 'password': pw})
        check(f'compte créé par {owner}, connexion via {other_name}', s == 200 and tok, f'{s} {body}')

    cases = [
        ('mauvais mot de passe', 'POST', '/auth/login', {'identifier': users['Node'][0], 'password': 'faux12345'}),
        ('compte inconnu', 'POST', '/auth/login', {'identifier': 'personne@exemple.tg', 'password': 'faux12345'}),
        ('mot de passe trop faible', 'POST', '/auth/register', {'name': 'Ab', 'email': 'x@exemple.tg', 'password': 'court'}),
        ('e-mail déjà utilisé', 'POST', '/auth/register', {'name': 'Abc', 'email': users['Node'][0], 'password': pw}),
        ('ni e-mail ni téléphone', 'POST', '/auth/register', {'name': 'Abc', 'password': pw}),
        ('champ non autorisé', 'POST', '/auth/register', {'name': 'Abc', 'email': 'y@exemple.tg', 'password': pw, 'role': 'ADMIN'}),
        ('profil sans connexion', 'GET', '/auth/me', None),
        ('mot de passe oublié (réponse muette)', 'POST', '/auth/password/forgot', {'email': 'personne@exemple.tg'}),
        ('lien de réinitialisation invalide', 'POST', '/auth/password/reset', {'token': 'x' * 40, 'password': pw}),
    ]
    for label, method, path, body in cases:
        (sa, a, _), (sb, b, _) = call(NODE, method, path, body), call(DJANGO, method, path, body)
        same = sa == sb and (sa == 204 or (a or {}).get('message') == (b or {}).get('message') or sa == 400)
        check(f'{label} : {sa}', same, f'Node {sa} {a} / Django {sb} {b}')

    # Liste des appareils, changement de profil, déconnexion.
    tok = users['Django'][2]
    s, body, _ = call(NODE, 'GET', '/auth/sessions', token=tok)
    s2, body2, _ = call(DJANGO, 'GET', '/auth/sessions', token=tok)
    check('appareils connectés : même liste', s == s2 == 200 and body == body2, f'{body} / {body2}')
    s, body, _ = call(DJANGO, 'PATCH', '/auth/me', {'name': 'Nouveau Nom'}, token=tok)
    s2, body2, _ = call(NODE, 'GET', '/auth/me', token=tok)
    check('profil modifié par Django, lu par Node', s == 200 and body == body2 and body2['name'] == 'Nouveau Nom', f'{body} / {body2}')
    s, _, _ = call(DJANGO, 'POST', '/auth/logout', token=tok)
    s2, _, _ = call(NODE, 'GET', '/auth/me', token=tok)
    check('déconnexion par Django : session refusée par Node', s == 204 and s2 == 401, f'{s} {s2}')

    print(f'\n{sum(results)}/{len(results)} vérifications réussies')
    sys.exit(0 if all(results) else 1)


if __name__ == '__main__':
    main()
