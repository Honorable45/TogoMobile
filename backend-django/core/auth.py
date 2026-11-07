"""
Sessions opaques côté serveur, compatibles avec l'API Node : même cookie httpOnly (tm_session),
même jeton aléatoire, la base n'en conserve que l'empreinte SHA-256. Révocation immédiate possible.
"""

from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication

from .errors import ApiError
from .models import Session
from .security import random_token, sha256

TOUCH_INTERVAL = timedelta(minutes=5)


@dataclass
class AuthUser:
    id: str
    name: str
    role: str
    session_id: str

    is_authenticated = True


def resolve(token) -> AuthUser | None:
    if not isinstance(token, str) or not 20 <= len(token) <= 100:
        return None
    s = Session.objects.select_related('user').filter(token_hash=sha256(token)).first()
    now = timezone.now()
    if not s or s.revoked_at or s.expires_at <= now or s.user.status != 'ACTIVE':
        return None
    if now - s.last_used_at > TOUCH_INTERVAL:
        Session.objects.filter(id=s.id).update(last_used_at=now)
    return AuthUser(id=s.user.id, name=s.user.name, role=s.user.role, session_id=s.id)


class CookieSessionAuthentication(BaseAuthentication):
    """Identifie l'utilisateur à partir du cookie ; les routes décident ensuite si la connexion est requise."""

    def authenticate(self, request):
        user = resolve(request.COOKIES.get(settings.SESSION['cookie_name']))
        return (user, None) if user else None


def require_user(request, roles: tuple[str, ...] = ()) -> AuthUser:
    user = request.user
    if not user:
        raise ApiError(401, 'Veuillez vous connecter pour continuer.')
    if roles and user.role not in roles:
        raise ApiError(403, "Vous n'avez pas accès à cette ressource.")
    return user


def _cookie_options():
    s = settings.SESSION
    return {
        'httponly': True,
        'secure': not settings.DEBUG or s['same_site'] == 'none',
        'samesite': s['same_site'].capitalize(),
        'domain': s['domain'],
        'path': '/',
    }


def create_session(response, user_id: str, user_agent: str | None):
    token = random_token()
    days = settings.SESSION['days']
    Session.objects.create(
        user_id=user_id,
        token_hash=sha256(token),
        user_agent=(user_agent or '')[:300] or None,
        expires_at=timezone.now() + timedelta(days=days),
    )
    response.set_cookie(settings.SESSION['cookie_name'], token, max_age=days * 24 * 3600, **_cookie_options())


def clear_cookie(response):
    o = _cookie_options()
    response.delete_cookie(settings.SESSION['cookie_name'], path=o['path'], domain=o['domain'], samesite=o['samesite'])


def revoke(session_id: str):
    Session.objects.filter(id=session_id, revoked_at__isnull=True).update(revoked_at=timezone.now())


def revoke_all(user_id: str, except_session_id: str | None = None):
    qs = Session.objects.filter(user_id=user_id, revoked_at__isnull=True)
    if except_session_id:
        qs = qs.exclude(id=except_session_id)
    qs.update(revoked_at=timezone.now())
