"""Numéros au format E.164, identique à backend/src/common/phone.ts. Indicatif par défaut : +228 (Togo)."""

import re

DEFAULT_COUNTRY_CODE = '228'


def normalize_phone(value) -> str | None:
    if not value:
        return None
    trimmed = str(value).strip()
    if not trimmed:
        return None
    digits = re.sub(r'[^\d+]', '', trimmed)
    if digits.startswith('00'):
        digits = '+' + digits[2:]
    if digits.startswith('+'):
        international = re.sub(r'\D', '', digits[1:])
    else:
        local = re.sub(r'\D', '', digits)
        if len(local) == 8:
            international = DEFAULT_COUNTRY_CODE + local
        elif local.startswith(DEFAULT_COUNTRY_CODE) and len(local) == 11:
            international = local
        else:
            return None
    if len(international) < 8 or len(international) > 15 or international.startswith('0'):
        return None
    if international.startswith(DEFAULT_COUNTRY_CODE) and len(international) != 11:
        return None
    return '+' + international


def whatsapp_digits(e164: str) -> str:
    return re.sub(r'\D', '', e164)
