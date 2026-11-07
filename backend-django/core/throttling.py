"""
Limitation de débit par adresse IP, comme l'API Node (ThrottlerGuard sur req.ip).

Les classes « Anon » de DRF ne limitent que les visiteurs non connectés : un compte connecté pourrait
alors tenter des milliers de mots de passe (changement de mot de passe). Ici, la clé est toujours l'IP,
connecté ou non. L'IP est lue derrière TRUST_PROXY_HOPS proxys de confiance (NUM_PROXIES) : un en-tête
X-Forwarded-For fabriqué par le client ne permet pas de contourner la limite.
"""

from rest_framework.throttling import SimpleRateThrottle


class IpThrottle(SimpleRateThrottle):
    scope = 'global'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


def ip_throttle(scope: str):
    """Limite propre à une route (connexion, inscription…), en plus de la limite globale."""
    return type(f'{scope.title().replace("_", "")}IpThrottle', (IpThrottle,), {'scope': scope})


def throttles(*scopes: str):
    """Liste à passer à @throttle_classes : la limite globale reste appliquée."""
    return [IpThrottle, *(ip_throttle(s) for s in scopes)]
