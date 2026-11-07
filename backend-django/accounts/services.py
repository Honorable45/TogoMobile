"""Comptes : inscription, connexion, profil, mots de passe, sessions (backend/src/auth/auth.service.ts)."""

from datetime import timedelta
from urllib.parse import quote

from django.conf import settings
from django.db.models import F, Q
from django.utils import timezone

from core import mail
from core.audit import audit
from core.auth import revoke_all
from core.errors import ApiError
from core.models import PasswordResetToken, Session, User
from core.phone import normalize_phone
from core.presenter import iso
from core.security import DUMMY_HASH, hash_password, random_token, sha256, verify_password

RESET_TTL = timedelta(hours=1)


def me(user_id: str):
    u = User.objects.select_related('shop').get(id=user_id)
    shop = getattr(u, 'shop', None)
    return {
        'id': u.id,
        'name': u.name,
        'email': u.email,
        'phone': u.phone,
        'role': u.role,
        'createdAt': iso(u.created_at),
        'shop': {'id': shop.id, 'name': shop.name, 'slug': shop.slug, 'status': shop.status} if shop else None,
    }


def _clash(email, phone, exclude_id=None):
    cond = Q()
    if email:
        cond |= Q(email=email)
    if phone:
        cond |= Q(phone=phone)
    qs = User.objects.filter(cond)
    if exclude_id:
        qs = qs.exclude(id=exclude_id)
    return qs.exists()


def register(name: str, email: str | None, phone_input: str | None, password: str) -> str:
    email = email.lower() if email else None
    phone = normalize_phone(phone_input)
    if not email and not phone:
        raise ApiError(400, 'Renseignez une adresse e-mail ou un numéro de téléphone.')
    if _clash(email, phone):
        raise ApiError(409, 'Un compte existe déjà avec cet e-mail ou ce numéro.')
    # Le rôle n'est jamais accepté depuis la requête : tout nouveau compte est un compte client.
    u = User.objects.create(name=name, email=email, phone=phone, password_hash=hash_password(password), role='CUSTOMER')
    audit(u.id, 'user.register', 'User', u.id)
    return u.id


def validate_credentials(identifier: str, password: str) -> User:
    ident = identifier.strip()
    if '@' in ident:
        user = User.objects.filter(email=ident.lower()).first()
    else:
        user = User.objects.filter(phone=normalize_phone(ident) or '__invalid__').first()

    now = timezone.now()
    # Compte temporairement verrouillé : on ne vérifie même pas le mot de passe.
    if user and user.locked_until and user.locked_until > now:
        minutes = -(-int((user.locked_until - now).total_seconds()) // 60)
        raise ApiError(
            429,
            f'Trop de tentatives de connexion sur ce compte. Réessayez dans {minutes} min ou réinitialisez votre mot de passe.',
            code='ACCOUNT_LOCKED',
        )
    ok = verify_password(password, user.password_hash if user else DUMMY_HASH)
    if not user or not ok:
        if user:
            _record_failure(user.id)
        raise ApiError(401, 'Identifiants incorrects.')
    if user.status != 'ACTIVE':
        raise ApiError(401, 'Ce compte est suspendu. Contactez le support de la plateforme.')
    if user.failed_login_count or user.locked_until:
        User.objects.filter(id=user.id).update(failed_login_count=0, locked_until=None)
    return user


def _record_failure(user_id: str):
    """Compteur atomique ; verrouillage temporaire au seuil (LOGIN_MAX_FAILURES, LOGIN_LOCK_MINUTES)."""
    sec = settings.SECURITY
    User.objects.filter(id=user_id).update(failed_login_count=F('failed_login_count') + 1)
    count = User.objects.filter(id=user_id).values_list('failed_login_count', flat=True).first() or 0
    if count >= sec['login_max_failures']:
        User.objects.filter(id=user_id).update(
            failed_login_count=0, locked_until=timezone.now() + timedelta(minutes=sec['login_lock_minutes'])
        )
        audit(user_id, 'user.locked', 'User', user_id, {'minutes': sec['login_lock_minutes']})


def update_profile(user_id: str, name=None, email=None, phone_input=None):
    email = email.lower() if email else None
    phone = normalize_phone(phone_input) if phone_input else None
    if (email or phone) and _clash(email, phone, exclude_id=user_id):
        raise ApiError(409, 'Cet e-mail ou ce numéro est déjà utilisé.')
    fields = {k: v for k, v in {'name': name, 'email': email, 'phone': phone}.items() if v is not None}
    if fields:
        User.objects.filter(id=user_id).update(**fields, updated_at=timezone.now())
    return me(user_id)


def change_password(user_id: str, session_id: str, current: str, new: str):
    u = User.objects.get(id=user_id)
    if not verify_password(current, u.password_hash):
        raise ApiError(400, 'Le mot de passe actuel est incorrect.')
    User.objects.filter(id=user_id).update(password_hash=hash_password(new), updated_at=timezone.now())
    revoke_all(user_id, session_id)  # les autres appareils sont déconnectés
    audit(user_id, 'user.password_change', 'User', user_id)


def forgot_password(email_input: str):
    email = email_input.lower()
    user = User.objects.filter(email=email).first()
    # Réponse identique que le compte existe ou non (pas d'énumération).
    if not user or user.status != 'ACTIVE':
        return
    token = random_token()
    PasswordResetToken.objects.create(user_id=user.id, token_hash=sha256(token), expires_at=timezone.now() + RESET_TTL)
    link = f'{settings.WEB_URL}/reinitialiser-mot-de-passe?token={quote(token, safe="")}'
    mail.send(
        email,
        'Réinitialisation de votre mot de passe',
        f'Bonjour {user.name},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable une heure) :\n{link}\n\n'
        "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
    )
    audit(user.id, 'user.password_reset_request', 'User', user.id)


def reset_password(token: str, password: str):
    now = timezone.now()
    record = PasswordResetToken.objects.filter(token_hash=sha256(token)).first()
    if not record or record.used_at or record.expires_at <= now:
        raise ApiError(400, 'Ce lien de réinitialisation est invalide ou expiré.')
    # Consommation atomique : un lien ne sert qu'une fois.
    if PasswordResetToken.objects.filter(id=record.id, used_at__isnull=True).update(used_at=now) != 1:
        raise ApiError(400, 'Ce lien de réinitialisation a déjà été utilisé.')
    User.objects.filter(id=record.user_id).update(
        password_hash=hash_password(password), failed_login_count=0, locked_until=None, updated_at=now
    )
    revoke_all(record.user_id)
    audit(record.user_id, 'user.password_reset', 'User', record.user_id)


def list_sessions(user_id: str, current_session_id: str):
    rows = Session.objects.filter(user_id=user_id, revoked_at__isnull=True, expires_at__gt=timezone.now()).order_by('-last_used_at')
    return [
        {
            'id': s.id,
            'userAgent': s.user_agent,
            'createdAt': iso(s.created_at),
            'lastUsedAt': iso(s.last_used_at),
            'current': s.id == current_session_id,
        }
        for s in rows
    ]


def revoke_session(user_id: str, session_id: str):
    n = Session.objects.filter(id=session_id, user_id=user_id, revoked_at__isnull=True).update(revoked_at=timezone.now())
    return {'revoked': n == 1}
