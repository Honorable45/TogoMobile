"""
Tests d'attaque de base contre l'API Django (à lancer sur un serveur local, TRUST_PROXY_HOPS=1).
Usage : python scripts/security_check.py [http://localhost:8000]
Chaque exécution consomme les quotas de limitation : attendre une minute entre deux exécutions.
"""

import json
import secrets
import sys
import urllib.error
import urllib.request

API = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000') + '/api/v1'
results = []


def call(method, path, body=None, headers=None, raw=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(API + path, method=method, data=data)
    req.add_header('Content-Type', 'application/json')
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.headers


def check(label, ok, detail=''):
    results.append(bool(ok))
    print('OK   ' if ok else 'ÉCHEC', label, '' if ok else detail)


def ip():
    return f'203.0.113.{secrets.randbelow(250) + 1}'


def main():
    # 1. Limite de connexion : un faux X-Forwarded-For ne la contourne pas (le proxy ajoute la vraie IP en dernier).
    real = ip()
    codes = [call('POST', '/auth/login', {'identifier': 'personne@exemple.tg', 'password': 'faux12345'},
                  {'X-Forwarded-For': f'198.51.100.{i}, {real}'})[0] for i in range(12)]
    check('limite de connexion malgré un faux X-Forwarded-For', 429 in codes and codes.index(429) <= 10, codes)

    # 2. Un compte connecté est limité lui aussi (essais de mot de passe via « changer le mot de passe »).
    who = ip()
    s, h = call('POST', '/auth/register', {'name': 'Essai Sécu', 'email': f'secu-{secrets.token_hex(4)}@exemple.tg', 'password': 'Essai12345'}, {'X-Forwarded-For': who})
    token = next((c.split('=', 1)[1].split(';')[0] for c in h.get_all('Set-Cookie') or [] if c.startswith('tm_session=')), None)
    codes = [call('POST', '/auth/password/change', {'currentPassword': f'essai{i}', 'newPassword': 'Nouveau12345'},
                  {'X-Forwarded-For': who, 'Cookie': f'tm_session={token}'})[0] for i in range(7)]
    check('compte connecté limité sur le changement de mot de passe', s == 201 and 429 in codes, codes)

    # 3. En-têtes de sécurité.
    _, h = call('GET', '/home', headers={'X-Forwarded-For': ip()})
    want = {'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'}
    check('en-têtes de sécurité', all(h.get(k) == v for k, v in want.items()), dict(h))

    # 4. Corps de requête trop volumineux : refus propre (413), pas d'erreur interne.
    s, _ = call('POST', '/auth/login', raw=b'{"identifier":"' + b'a' * 300_000 + b'","password":"x"}', headers={'X-Forwarded-For': ip()})
    check('corps trop volumineux refusé (413)', s == 413, s)

    # 5. Requête modifiante depuis un autre site : refusée.
    s, _ = call('POST', '/auth/logout', {}, {'Origin': 'https://site-pirate.example', 'X-Forwarded-For': ip()})
    check('requête venue d’un autre site refusée (403)', s == 403, s)

    # 6. CORS : seule une origine autorisée reçoit l'autorisation.
    _, h = call('GET', '/home', headers={'Origin': 'https://site-pirate.example', 'X-Forwarded-For': ip()})
    check('CORS refusé à une origine inconnue', 'Access-Control-Allow-Origin' not in h, dict(h))

    # 7. Champ « role » refusé à l'inscription (pas d'élévation de privilèges).
    s, _ = call('POST', '/auth/register', {'name': 'Abc', 'email': f'r-{secrets.token_hex(3)}@exemple.tg', 'password': 'Essai12345', 'role': 'ADMIN'}, {'X-Forwarded-For': ip()})
    check('inscription avec role=ADMIN refusée (400)', s == 400, s)

    # 8. Cookie de session invalide ou fabriqué : non reconnu.
    s, _ = call('GET', '/auth/me', headers={'Cookie': 'tm_session=' + 'A' * 43, 'X-Forwarded-For': ip()})
    check('cookie de session fabriqué rejeté (401)', s == 401, s)

    # 9. Injection SQL dans la recherche : traitée comme du texte.
    s, _ = call('GET', "/catalog/products?q=%27%3B%20DROP%20TABLE%20%22Product%22%3B--&sort=price_asc", headers={'X-Forwarded-For': ip()})
    s2, _ = call('GET', '/catalog/products?pageSize=1', headers={'X-Forwarded-For': ip()})
    check('injection SQL dans la recherche sans effet', s == 200 and s2 == 200, (s, s2))

    print(f'\n{sum(results)}/{len(results)} vérifications réussies')
    sys.exit(0 if all(results) else 1)


if __name__ == '__main__':
    main()
