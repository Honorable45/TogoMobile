"""Format d'erreur uniforme, identique à l'API Node : { statusCode, message, errors? }."""

import logging

from rest_framework.exceptions import Throttled
from rest_framework.response import Response

log = logging.getLogger('api')


class ApiError(Exception):
    def __init__(self, status: int, message: str, errors: dict | None = None, code: str | None = None):
        super().__init__(message)
        self.status, self.message, self.errors, self.code = status, message, errors, code


def handle(exc, context):
    if isinstance(exc, ApiError):
        body = {'statusCode': exc.status, 'message': exc.message}
        if exc.errors:
            body['errors'] = exc.errors
        if exc.code:
            body['code'] = exc.code
        return Response(body, status=exc.status)
    if isinstance(exc, Throttled):
        return Response({'statusCode': 429, 'message': 'Trop de tentatives. Patientez une minute puis réessayez.'}, status=429)
    from rest_framework.views import exception_handler  # import tardif : évite une boucle avec l'authentification

    res = exception_handler(exc, context)
    if res is not None:
        detail = res.data.get('detail') if isinstance(res.data, dict) else None
        res.data = {'statusCode': res.status_code, 'message': str(detail) if detail else 'Certaines informations sont invalides.'}
        return res
    # Les erreurs internes ne divulguent jamais de détails techniques au client.
    log.exception('Erreur inattendue', exc_info=exc)
    return Response({'statusCode': 500, 'message': 'Une erreur inattendue est survenue. Veuillez réessayer.'}, status=500)
