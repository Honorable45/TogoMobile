"""
Réglages Django de l'API TogoMobile. Tout se configure par variables d'environnement,
avec les mêmes noms que l'API Node (DATABASE_URL, API_URL, WEB_URL, STORAGE_DRIVER, CLOUDINARY_URL…).
"""

import os
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name, default=None):
    return os.environ.get(name, default)


def env_bool(name, default=False):
    return env(name, str(default)).lower() in ('1', 'true', 'yes')


DEBUG = env_bool('DJANGO_DEBUG')
SECRET_KEY = env('DJANGO_SECRET_KEY') or ('dev-insecure-key' if DEBUG else None)
if not SECRET_KEY:
    raise RuntimeError('DJANGO_SECRET_KEY est obligatoire hors mode développement.')
ALLOWED_HOSTS = [h.strip() for h in env('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if h.strip()]

API_URL = env('API_URL', 'http://localhost:4000').rstrip('/')
WEB_URL = env('WEB_URL', 'http://localhost:3000').rstrip('/')
PAGINATION_MAX_OFFSET = int(env('PAGINATION_MAX_OFFSET', '5000'))

STORAGE = {
    'driver': env('STORAGE_DRIVER', 'local'),
    's3_public_url': (env('S3_PUBLIC_URL') or '').rstrip('/'),
    'cloudinary_url': env('CLOUDINARY_URL', ''),
    'cloudinary_cloud_name': env('CLOUDINARY_CLOUD_NAME', ''),
    'cloudinary_folder': (env('CLOUDINARY_FOLDER') or 'togomobile').strip('/'),
    'cloudinary_delivery_base': (env('CLOUDINARY_DELIVERY_BASE') or 'https://res.cloudinary.com').rstrip('/'),
}

INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'rest_framework',
    'core',
    'catalog',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.middleware.common.CommonMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'
APPEND_SLASH = False

DATABASES = {
    'default': dj_database_url.parse(
        # Prisma accepte ?schema=public et ?connection_limit= : paramètres inconnus de psycopg, retirés ici.
        (env('DATABASE_URL') or '').split('?')[0],
        conn_max_age=int(env('DB_CONN_MAX_AGE', '60')),
        conn_health_checks=True,
    )
}

USE_TZ = True
TIME_ZONE = 'UTC'
LANGUAGE_CODE = 'fr-fr'
USE_I18N = False
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
    'DEFAULT_PARSER_CLASSES': ['rest_framework.parsers.JSONParser'],
    'DEFAULT_AUTHENTICATION_CLASSES': [],
    'DEFAULT_PERMISSION_CLASSES': [],
    'UNAUTHENTICATED_USER': None,
    'EXCEPTION_HANDLER': 'core.errors.handle',
    'DEFAULT_THROTTLE_RATES': {'whatsapp': '20/min', 'view': '60/min'},
}

# Limitation de débit : mémoire locale par défaut (un processus) ; REDIS_URL pour plusieurs instances.
CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
if env('REDIS_URL'):
    CACHES = {'default': {'BACKEND': 'django.core.cache.backends.redis.RedisCache', 'LOCATION': env('REDIS_URL')}}

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'root': {'handlers': ['console'], 'level': env('LOG_LEVEL', 'INFO')},
}
