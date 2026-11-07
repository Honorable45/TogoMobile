"""
Protection CSRF, comme l'OriginGuard de l'API Node : une requête qui modifie des données et porte
un en-tête Origin doit venir d'une origine autorisée. Complète le cookie SameSite.
"""

from django.conf import settings
from django.http import JsonResponse

SAFE_METHODS = {'GET', 'HEAD', 'OPTIONS'}


class OriginCheckMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.allowed = {o.rstrip('/') for o in [*settings.CORS_ORIGINS, settings.WEB_URL, settings.API_URL]}

    def __call__(self, request):
        origin = request.headers.get('Origin')
        if request.method not in SAFE_METHODS and origin and origin.rstrip('/') not in self.allowed:
            return JsonResponse({'statusCode': 403, 'message': 'Origine de la requête non autorisée.'}, status=403)
        return self.get_response(request)


class CorsMiddleware:
    """
    CORS avec cookies, limité aux origines autorisées (CORS_ORIGINS, ADMIN_URL) — comme enableCors côté Node.
    Le site public passe par son propre relais /api/v1 (même origine) ; l'administration appelle l'API directement.
    """

    METHODS = 'GET, POST, PUT, PATCH, DELETE'

    def __init__(self, get_response):
        self.get_response = get_response
        self.allowed = {o.rstrip('/') for o in settings.CORS_ORIGINS}

    def __call__(self, request):
        origin = (request.headers.get('Origin') or '').rstrip('/')
        allowed = origin in self.allowed
        if request.method == 'OPTIONS' and request.headers.get('Access-Control-Request-Method'):
            from django.http import HttpResponse

            response = HttpResponse(status=204)
            if allowed:
                response['Access-Control-Allow-Methods'] = self.METHODS
                response['Access-Control-Allow-Headers'] = request.headers.get('Access-Control-Request-Headers', '')
                response['Access-Control-Max-Age'] = '600'
        else:
            response = self.get_response(request)
        if allowed:
            response['Access-Control-Allow-Origin'] = origin
            response['Access-Control-Allow-Credentials'] = 'true'
            response['Vary'] = 'Origin'
        return response
