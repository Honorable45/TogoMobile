"""
Adresse publique d'un fichier stocké, selon le pilote (STORAGE_DRIVER) : mêmes URL que l'API Node.
  - local      : {MEDIA_BASE_URL}/media/{clé}  (MEDIA_BASE_URL vaut API_URL par défaut)
  - s3         : {S3_PUBLIC_URL}/{clé}
  - cloudinary : {livraison}/{cloud}/{image|video}/upload/{dossier}/{clé sans extension}.{ext}
"""

import re
from functools import lru_cache

from django.conf import settings

_CLOUDINARY_TYPES = {
    **dict.fromkeys(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'heic'], 'image'),
    **dict.fromkeys(['mp4', 'mov', 'webm'], 'video'),
}
_KEY = re.compile(r'^[a-z0-9][a-z0-9/_-]*\.[a-z0-9]{2,5}$')


@lru_cache
def _cloudinary():
    s = settings.STORAGE
    name = s['cloudinary_cloud_name']
    m = re.match(r'^cloudinary://[^:]+:[^@]+@(.+)$', s['cloudinary_url'] or '')
    if m:
        name = m.group(1)
    return name


def public_url(key: str | None) -> str | None:
    if not key:
        return None
    s = settings.STORAGE
    driver = s['driver']
    if driver == 's3':
        return f"{s['s3_public_url']}/{key}"
    if driver == 'cloudinary':
        if not _KEY.match(key) or '..' in key:
            return None
        base, ext = key.rsplit('.', 1)
        kind = _CLOUDINARY_TYPES.get(ext)
        if not kind:
            return None
        return f"{s['cloudinary_delivery_base']}/{_cloudinary()}/{kind}/upload/{s['cloudinary_folder']}/{base}.{ext}"
    return f"{settings.MEDIA_BASE_URL}/media/{key}"
