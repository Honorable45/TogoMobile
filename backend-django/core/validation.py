"""Validation des corps JSON, mêmes règles et mêmes messages que les DTO de l'API Node."""

import re

from .errors import ApiError
from .phone import normalize_phone

EMAIL = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$')
STRONG = re.compile(r'^(?=.*[A-Za-z])(?=.*\d).{8,128}$', re.S)
PASSWORD_MSG = 'Le mot de passe doit contenir au moins 8 caractères, dont une lettre et un chiffre.'
PHONE_MSG = 'Numéro de téléphone invalide (ex. +228 90 12 34 56).'


class Body:
    """Lit un corps JSON champ par champ, collecte les erreurs puis les lève toutes ensemble."""

    def __init__(self, data, allowed: set[str]):
        self.data = data if isinstance(data, dict) else {}
        self.errors: dict[str, str] = {}
        for k in self.data:
            if k not in allowed:
                self.errors[k] = 'Champ non autorisé.'

    def _str(self, name, trim=True):
        v = self.data.get(name)
        if v is None:
            return None
        if not isinstance(v, str):
            self.errors[name] = f'{name} doit être une chaîne de caractères.'
            return None
        if trim:
            v = v.strip()
            return v or None
        return v

    def text(self, name, lo=None, hi=None, required=True, msg=None, trim=True):
        v = self._str(name, trim)
        if v is None:
            if required and name not in self.errors:
                self.errors[name] = msg or f'{name} est obligatoire.'
            return None
        if (lo and len(v) < lo) or (hi and len(v) > hi):
            self.errors[name] = msg or f'{name} doit contenir entre {lo or 0} et {hi} caractères.'
        return v

    def email(self, name, required=False):
        v = self._str(name)
        if v is None:
            if required and name not in self.errors:
                self.errors[name] = 'Adresse e-mail invalide.'
            return None
        if not EMAIL.match(v) or len(v) > 160:
            self.errors[name] = 'Adresse e-mail invalide.'
        return v

    def phone(self, name):
        v = self._str(name)
        if v is None:
            return None
        if not normalize_phone(v):
            self.errors[name] = PHONE_MSG
        return v

    def password(self, name):
        v = self._str(name, trim=False)
        if v is None or not STRONG.match(v):
            self.errors.setdefault(name, PASSWORD_MSG)
        return v

    def done(self):
        if self.errors:
            raise ApiError(400, next(iter(self.errors.values())), self.errors)
