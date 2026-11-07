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
