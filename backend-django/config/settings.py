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
# Relais de migration vers l'API Node pour les routes pas encore réécrites (vide = désactivé).
LEGACY_API_URL = (env('LEGACY_API_URL') or '').rstrip('/')
CORS_ORIGINS = [o.strip() for o in env('CORS_ORIGINS', 'http://localhost:3000').split(',') if o.strip()]
if env('ADMIN_URL'):
    CORS_ORIGINS.append(env('ADMIN_URL'))

# Secret partagé avec l'API Node (HMAC des numéros d'acheteurs) : même valeur obligatoire.
APP_SECRET = env('APP_SECRET') or ('dev-only-secret-change-me-dev-only-secret' if DEBUG else None)
if not APP_SECRET:
    raise RuntimeError('APP_SECRET est obligatoire hors mode développement.')

# Sessions : mêmes réglages et même cookie que l'API Node (une session ouverte d'un côté vaut de l'autre).
SESSION = {
    'cookie_name': env('SESSION_COOKIE_NAME', 'tm_session'),
    'domain': env('SESSION_COOKIE_DOMAIN') or None,
    'same_site': env('SESSION_COOKIE_SAMESITE', 'lax'),
    'days': int(env('SESSION_DAYS', '30')),
}
SECURITY = {
    'login_max_failures': int(env('LOGIN_MAX_FAILURES', '8')),
    'login_lock_minutes': int(env('LOGIN_LOCK_MINUTES', '15')),
}
MAIL = {
    'driver': env('MAIL_DRIVER', 'console'),
    'from': env('MAIL_FROM', 'TogoMobile <no-reply@example.com>'),
    'resend_api_key': env('RESEND_API_KEY', ''),
}
if not DEBUG and MAIL['driver'] == 'console':
    raise RuntimeError('MAIL_DRIVER=console est interdit en production : configurez MAIL_DRIVER=resend.')

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
    'accounts',
    'shops',
    'favorites',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'core.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'core.middleware.OriginCheckMiddleware',
]

# ─── En-têtes de sécurité (équivalent de helmet côté Node) ──────────────────
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'no-referrer'
SECURE_CROSS_ORIGIN_OPENER_POLICY = 'same-origin'
X_FRAME_OPTIONS = 'DENY'
# Derrière le proxy HTTPS de l'hébergeur : le schéma d'origine est transmis par X-Forwarded-Proto.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
if not DEBUG:
    SECURE_HSTS_SECONDS = 15552000  # 180 jours
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_SSL_REDIRECT = env_bool('DJANGO_SSL_REDIRECT', True)
    SECURE_REDIRECT_EXEMPT = [r'^api/v1/health']

# Taille maximale des corps de requête (JSON) : 200 Ko, comme l'API Node.
DATA_UPLOAD_MAX_MEMORY_SIZE = 200 * 1024

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'
APPEND_SLASH = False

DATABASES = {
    'default': dj_database_url.parse(
        # Prisma accepte ?schema=public et ?connection_limit= : paramètres inconnus de psycopg, retirés ici.
        (env('DATABASE_URL') or '').split('?')[0],
        # Connexions persistantes : utiles avec gunicorn (quelques processus fixes). Le serveur de
        # développement ouvre un fil par requête : chacun garderait sa connexion ouverte et
        # PostgreSQL saturerait (« remaining connection slots are reserved »). D'où 0 en DEBUG.
        conn_max_age=int(env('DB_CONN_MAX_AGE', '0' if DEBUG else '60')),
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
    'DEFAULT_AUTHENTICATION_CLASSES': ['core.auth.CookieSessionAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': [],
    'UNAUTHENTICATED_USER': None,
    'EXCEPTION_HANDLER': 'core.errors.handle',
    'DEFAULT_THROTTLE_CLASSES': ['core.throttling.IpThrottle'],
    # Proxys de confiance devant l'API (hébergeur) : comme TRUST_PROXY_HOPS côté Node.
    'NUM_PROXIES': int(env('TRUST_PROXY_HOPS', '1')),
    'DEFAULT_THROTTLE_RATES': {
        'global': f"{int(env('RATE_LIMIT_PER_MINUTE', '120'))}/min",
        'whatsapp': '20/min',
        'view': '60/min',
        'register': '5/min',
        'login': '10/min',
        'password_change': '5/min',
        'password_forgot': '3/min',
        'password_reset': '5/min',
    },
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

# Avertissements de `manage.py check --deploy` écartés en connaissance de cause :
#  - security.W003 : pas de formulaires Django ; la protection CSRF repose, comme côté Node, sur le cookie
#    de session SameSite=Lax et sur OriginCheckMiddleware (origine vérifiée pour toute requête qui modifie).
#  - security.W021 : l'inscription à la liste HSTS « preload » engage durablement le domaine ; décision à prendre
#    au moment de la mise en production (SECURE_HSTS_PRELOAD = True).
SILENCED_SYSTEM_CHECKS = ['security.W003', 'security.W021']
