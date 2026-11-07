"""Normalisation du texte, identique à backend/src/common/text.ts."""

import re
import unicodedata


def fold(value: str) -> str:
    """Supprime les accents et met en minuscules."""
    return ''.join(c for c in unicodedata.normalize('NFD', value) if not unicodedata.combining(c)).lower()


def normalize_search(value: str) -> str:
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9+]+', ' ', fold(value))).strip()


def escape_like(value: str) -> str:
    return re.sub(r'([\\%_])', r'\\\1', value)
