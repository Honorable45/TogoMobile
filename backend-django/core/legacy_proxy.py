"""
Relais de migration : les adresses /api/v1/* pas encore réécrites en Django sont transmises à l'API Node
(LEGACY_API_URL). Le site reste entièrement utilisable pendant que les modules passent un à un sur Django.
Désactivé si LEGACY_API_URL est vide (réponse 404 au format de l'API).

Transmis : méthode, corps, cookie, type de contenu, agent, origine ; l'IP du client est ajoutée à
X-Forwarded-For. Renvoyés : statut, corps, type de contenu, cookies et Retry-After.
"""

import logging
import urllib.error
import urllib.request

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt

log = logging.getLogger('legacy')
FORWARD_HEADERS = ('Cookie', 'Content-Type', 'User-Agent', 'Origin', 'Accept', 'Range')
RETURN_HEADERS = ('Content-Type', 'Retry-After', 'Cache-Control', 'Content-Range', 'Accept-Ranges')


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


_opener = urllib.request.build_opener(_NoRedirect)


@csrf_exempt
def relay(request, rest):
    base = settings.LEGACY_API_URL
    if not base:
        return JsonResponse({'statusCode': 404, 'message': f'Cannot {request.method} /api/v1/{rest}'}, status=404)
    url = f"{base}/api/v1/{rest}"
    if request.META.get('QUERY_STRING'):
        url += '?' + request.META['QUERY_STRING']
    req = urllib.request.Request(url, method=request.method, data=request.body or None)
    for h in FORWARD_HEADERS:
        if request.headers.get(h):
            req.add_header(h, request.headers[h])
    xff = request.headers.get('X-Forwarded-For')
    client = request.META.get('REMOTE_ADDR', '')
    req.add_header('X-Forwarded-For', f'{xff}, {client}' if xff else client)
    try:
        res = _opener.open(req, timeout=60)
    except urllib.error.HTTPError as e:
        res = e
    except (urllib.error.URLError, TimeoutError) as e:
        log.error('API Node injoignable pour %s %s : %s', request.method, rest, e)
        return JsonResponse({'statusCode': 502, 'message': 'Service momentanément indisponible. Veuillez réessayer.'}, status=502)
    with res:
        response = HttpResponse(res.read(), status=res.status)
        for h in RETURN_HEADERS:
            if res.headers.get(h):
                response[h] = res.headers[h]
        for cookie in res.headers.get_all('Set-Cookie') or []:
            # Transmis tel quel : même nom, mêmes options que l'API Node.
            response.cookies.load(cookie)
    return response
