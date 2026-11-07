"""
Primitives cryptographiques, compatibles octet pour octet avec backend/src/common/crypto.ts :
les mots de passe hachés par l'API Node se vérifient ici, et inversement.
"""

import base64
import hashlib
import hmac as _hmac
import secrets
import unicodedata

from django.conf import settings

SCRYPT_N, SCRYPT_R, SCRYPT_P = 32768, 8, 1
SCRYPT_MAXMEM = 64 * 1024 * 1024
KEYLEN = 64
REF_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'  # sans 0/O/1/I pour éviter les confusions


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def _unb64url(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int, dklen: int) -> bytes:
    return hashlib.scrypt(unicodedata.normalize('NFKC', password).encode(), salt=salt, n=n, r=r, p=p, maxmem=SCRYPT_MAXMEM, dklen=dklen)


def hash_password(password: str) -> str:
    """Format : scrypt$N$r$p$sel$empreinte (base64url sans remplissage)."""
    salt = secrets.token_bytes(16)
    digest = _scrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, KEYLEN)
    return '$'.join(['scrypt', str(SCRYPT_N), str(SCRYPT_R), str(SCRYPT_P), _b64url(salt), _b64url(digest)])


def verify_password(password: str, stored: str) -> bool:
    parts = (stored or '').split('$')
    if len(parts) != 6 or parts[0] != 'scrypt':
        return False
    try:
        n, r, p = int(parts[1]), int(parts[2]), int(parts[3])
        salt, expected = _unb64url(parts[4]), _unb64url(parts[5])
        actual = _scrypt(password, salt, n, r, p, len(expected))
    except (ValueError, TypeError):
        return False
    return _hmac.compare_digest(actual, expected)


# Empreinte factice : égalise le temps de réponse lorsque le compte n'existe pas.
DUMMY_HASH = 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$' + 'A' * 86


def random_token(nbytes: int = 32) -> str:
    """Jeton opaque aléatoire (256 bits par défaut), encodé en base64url."""
    return _b64url(secrets.token_bytes(nbytes))


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def hmac(value: str) -> str:
    """HMAC avec le secret serveur (APP_SECRET, le même que l'API Node) : données à faible entropie."""
    return _hmac.new(settings.APP_SECRET.encode(), value.encode(), hashlib.sha256).hexdigest()


def public_reference(prefix: str = 'TM', length: int = 6) -> str:
    """Référence publique courte et non séquentielle, ex. TM-7KQ2PX."""
    return f"{prefix}-{''.join(REF_ALPHABET[b % len(REF_ALPHABET)] for b in secrets.token_bytes(length))}"
