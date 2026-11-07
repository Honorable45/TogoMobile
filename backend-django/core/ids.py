"""Identifiants au format cuid (comme Prisma @default(cuid())) : « c » + 24 caractères base 36."""

import os
import secrets
import threading
import time

_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
_lock = threading.Lock()
_counter = secrets.randbelow(36**4)
_fingerprint = None


def _b36(n: int, width: int) -> str:
    out = ''
    while n:
        n, r = divmod(n, 36)
        out = _ALPHABET[r] + out
    return out.rjust(width, '0')[-width:]


def cuid() -> str:
    global _counter, _fingerprint
    if _fingerprint is None:
        _fingerprint = _b36(os.getpid(), 2) + _b36(secrets.randbits(32), 2)
    with _lock:
        _counter = (_counter + 1) % (36**4)
        count = _counter
    return 'c' + _b36(int(time.time() * 1000), 8) + _b36(count, 4) + _fingerprint + _b36(secrets.randbits(42), 8)
