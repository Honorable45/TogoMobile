"""Journal d'audit. Ne jamais y placer de mot de passe, jeton ou numéro de téléphone en clair."""

import logging

from .models import AuditLog

log = logging.getLogger('audit')


def audit(actor_id, action: str, target_type: str, target_id=None, metadata=None, strict: bool = False):
    try:
        AuditLog.objects.create(actor_id=actor_id, action=action, target_type=target_type, target_id=target_id, metadata=metadata or {})
    except Exception:
        # L'audit ne doit pas masquer l'erreur d'origine ; dans une transaction, l'échec est propagé.
        log.exception("Échec d'écriture du journal d'audit (%s)", action)
        if strict:
            raise
