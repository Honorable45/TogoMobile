import { existsSync } from 'node:fs';

/**
 * Lecture et validation centralisées des variables d'environnement.
 * L'application refuse de démarrer si une valeur obligatoire manque ou est invalide.
 */

function str(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return v;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Variable ${name} invalide : entier attendu`);
  return n;
}

function list(name: string, fallback: string): string[] {
  return str(name, fallback)
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/**
 * Cloudinary : CLOUDINARY_URL au format officiel cloudinary://<api_key>:<api_secret>@<cloud_name>
 * (tableau de bord Cloudinary → « API Keys »), ou les trois variables séparées.
 */
function cloudinaryConfig() {
  const raw = process.env.CLOUDINARY_URL || '';
  let cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
  let apiKey = process.env.CLOUDINARY_API_KEY || '';
  let apiSecret = process.env.CLOUDINARY_API_SECRET || '';
  if (raw) {
    const m = raw.match(/^cloudinary:\/\/([^:]+):([^@]+)@([^/?#]+)$/);
    if (!m) throw new Error('CLOUDINARY_URL invalide : format attendu cloudinary://<api_key>:<api_secret>@<cloud_name>');
    [apiKey, apiSecret, cloudName] = [decodeURIComponent(m[1]), decodeURIComponent(m[2]), m[3]];
  }
  return {
    cloudName,
    apiKey,
    apiSecret,
    /** Dossier racine dans le compte (sépare production et préproduction sur un même compte). */
    folder: (process.env.CLOUDINARY_FOLDER || 'togomobile').replace(/^\/+|\/+$/g, ''),
    /** Remplaçables uniquement pour les tests (serveur Cloudinary simulé). */
    apiBase: (process.env.CLOUDINARY_API_BASE || 'https://api.cloudinary.com').replace(/\/$/, ''),
    deliveryBase: (process.env.CLOUDINARY_DELIVERY_BASE || 'https://res.cloudinary.com').replace(/\/$/, ''),
  };
}

export type StorageDriver = 'local' | 's3' | 'cloudinary';
export type MailDriver = 'console' | 'resend';

function loadEnv() {
  // Chargement du fichier .env local s'il existe (développement). En production, les variables
  // sont fournies par l'hébergeur ; les valeurs déjà définies ne sont jamais écrasées.
  if (existsSync('.env')) process.loadEnvFile('.env');
  const nodeEnv = str('NODE_ENV', 'development');
  const isProd = nodeEnv === 'production';

  const env = {
    nodeEnv,
    isProd,
    isTest: nodeEnv === 'test',
    port: int('PORT', 4000),
    databaseUrl: str('DATABASE_URL'),
    /** URL publique du site (utilisée dans les liens WhatsApp, QR codes, e-mails). */
    webUrl: str('WEB_URL', 'http://localhost:3000').replace(/\/$/, ''),
    /** URL publique de l'API (utilisée pour servir les médias en stockage local). */
    apiUrl: str('API_URL', 'http://localhost:4000').replace(/\/$/, ''),
    /** URL de l'application d'administration (dossier admin/), autorisée comme origine. Vide : aucune. */
    adminUrl: str('ADMIN_URL', isProd ? '' : 'http://localhost:3001').replace(/\/$/, ''),
    corsOrigins: list('CORS_ORIGINS', 'http://localhost:3000'),
    /** Secret serveur utilisé pour les HMAC (numéros d'acheteur). Au moins 32 caractères en production. */
    appSecret: str('APP_SECRET', isProd ? undefined : 'dev-only-secret-change-me-dev-only-secret'),
    cookieName: str('SESSION_COOKIE_NAME', 'tm_session'),
    /** Domaine du cookie de session : laisser vide pour un cookie limité à l'hôte. */
    cookieDomain: process.env.SESSION_COOKIE_DOMAIN || undefined,
    /** lax (recommandé avec le proxy Next.js) ou none (front et API sur des sites différents, HTTPS obligatoire). */
    cookieSameSite: (str('SESSION_COOKIE_SAMESITE', 'lax') as 'lax' | 'none' | 'strict'),
    sessionDays: int('SESSION_DAYS', 30),
    trustProxy: int('TRUST_PROXY_HOPS', 1),

    storage: {
      driver: str('STORAGE_DRIVER', 'local') as StorageDriver,
      localDir: str('STORAGE_LOCAL_DIR', './storage'),
      bucket: process.env.S3_BUCKET || '',
      region: process.env.S3_REGION || 'auto',
      endpoint: process.env.S3_ENDPOINT || undefined,
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      /** URL publique du bucket (ex. domaine R2 personnalisé). */
      publicUrl: (process.env.S3_PUBLIC_URL || '').replace(/\/$/, ''),
      cloudinary: cloudinaryConfig(),
    },

    media: {
      maxImageBytes: int('MEDIA_MAX_IMAGE_MB', 8) * 1024 * 1024,
      maxVideoBytes: int('MEDIA_MAX_VIDEO_MB', 40) * 1024 * 1024,
      maxVideoSeconds: int('MEDIA_MAX_VIDEO_SECONDS', 90),
      /** Durée de validité d'une autorisation d'envoi direct (URL présignée). */
      uploadTtlSeconds: int('MEDIA_UPLOAD_TTL_SECONDS', 900),
      /** queue : traitement par le worker (production) ; inline : dans la requête (tests, dépannage). */
      processing: str('MEDIA_PROCESSING', nodeEnv === 'test' ? 'inline' : 'queue') as 'queue' | 'inline',
      /** Chemin de ffmpeg (miniature, durée et transcodage des vidéos). Vide : traitement vidéo minimal. */
      ffmpegPath: process.env.FFMPEG_PATH || '',
      transcodeVideo: str('MEDIA_TRANSCODE_VIDEO', 'true') === 'true',
    },

    jobs: {
      /** Lance le worker dans le processus de l'API (pratique en développement ; en production, service séparé). */
      inProcessWorker: str('WORKER_IN_PROCESS', nodeEnv === 'development' ? 'true' : 'false') === 'true',
      pollMs: int('WORKER_POLL_MS', 1000),
      concurrency: int('WORKER_CONCURRENCY', 2),
    },

    cache: {
      /** Durée de cache CDN (s-maxage) des réponses publiques de l'API. 0 : désactivé. */
      publicSeconds: int('PUBLIC_CACHE_SECONDS', 0),
      /** Webhook d'invalidation du site (Next.js) : https://www.exemple.tg/api/revalidate */
      webRevalidateUrl: process.env.WEB_REVALIDATE_URL || '',
      revalidateSecret: process.env.REVALIDATE_SECRET || '',
    },

    observability: {
      /** Jeton requis pour /api/v1/metrics (Prometheus). Vide : point de terminaison désactivé. */
      metricsToken: process.env.METRICS_TOKEN || '',
      slowQueryMs: int('SLOW_QUERY_MS', isProd ? 500 : 0),
      slowRequestMs: int('SLOW_REQUEST_MS', 1500),
    },

    security: {
      loginMaxFailures: int('LOGIN_MAX_FAILURES', 8),
      loginLockMinutes: int('LOGIN_LOCK_MINUTES', 15),
      /** Redis facultatif : compteurs de limitation de débit partagés entre plusieurs instances. */
      redisUrl: process.env.REDIS_URL || '',
      /** Limite globale par IP (requêtes par minute). Les routes sensibles ont leurs propres limites plus basses. */
      rateLimitPerMinute: int('RATE_LIMIT_PER_MINUTE', 120),
    },

    /** Profondeur maximale de pagination par décalage (protège PostgreSQL des parcours très profonds). */
    maxOffset: int('PAGINATION_MAX_OFFSET', 5000),

    mail: {
      driver: str('MAIL_DRIVER', 'console') as MailDriver,
      from: str('MAIL_FROM', 'TogoMobile <no-reply@example.com>'),
      resendApiKey: process.env.RESEND_API_KEY || '',
    },

    rules: {
      /** Nombre maximum de ventes déclarées par boutique sur 24 h. */
      maxSalesPerDay: int('RULE_MAX_SALES_PER_DAY', 30),
      /** Plafond réduit pour les boutiques validées depuis moins de 14 jours. */
      maxSalesPerDayNewShop: int('RULE_MAX_SALES_PER_DAY_NEW_SHOP', 5),
      /** Durée de validité d'un QR code d'avis, en jours. */
      reviewTokenDays: int('RULE_REVIEW_TOKEN_DAYS', 60),
      /** Fenêtre (jours) pour le calcul du prix de référence des promotions. */
      referencePriceDays: int('RULE_REFERENCE_PRICE_DAYS', 30),
      /** Durée maximale d'une promotion, en jours. */
      maxPromotionDays: int('RULE_MAX_PROMOTION_DAYS', 90),
    },
  };

  // L'administration appelle l'API depuis son propre domaine : son origine est autorisée (CORS et contrôle anti-CSRF).
  if (env.adminUrl && !env.corsOrigins.includes(env.adminUrl)) env.corsOrigins.push(env.adminUrl);

  if (isProd) {
    if (env.appSecret.length < 32) throw new Error('APP_SECRET doit contenir au moins 32 caractères en production');
    if (env.mail.driver === 'console') {
      // Les liens de réinitialisation ne doivent pas finir dans les journaux en production.
      throw new Error('MAIL_DRIVER=console est interdit en production : configurez MAIL_DRIVER=resend');
    }
    if (env.storage.driver === 'local') {
      // Les disques des hébergeurs (Render, etc.) ne sont pas persistants.
      throw new Error('STORAGE_DRIVER=local est interdit en production : configurez Cloudinary ou un stockage S3/R2');
    }
  }
  if (!['local', 's3', 'cloudinary'].includes(env.storage.driver)) throw new Error('STORAGE_DRIVER : local, s3 ou cloudinary');
  if (env.storage.driver === 'cloudinary') {
    const c = env.storage.cloudinary;
    if (!c.cloudName || !c.apiKey || !c.apiSecret) throw new Error('CLOUDINARY_URL est obligatoire avec STORAGE_DRIVER=cloudinary');
    if (!/^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/i.test(c.folder)) throw new Error('CLOUDINARY_FOLDER invalide (lettres, chiffres, - et _, séparés par /)');
  }
  if (env.storage.driver === 's3' && (!env.storage.bucket || !env.storage.publicUrl)) {
    throw new Error('S3_BUCKET et S3_PUBLIC_URL sont obligatoires avec STORAGE_DRIVER=s3');
  }
  if (env.cache.webRevalidateUrl && env.cache.revalidateSecret.length < 24) {
    throw new Error('REVALIDATE_SECRET (24 caractères minimum) est obligatoire avec WEB_REVALIDATE_URL');
  }
  if (env.mail.driver === 'resend' && !env.mail.resendApiKey) {
    throw new Error('RESEND_API_KEY est obligatoire avec MAIL_DRIVER=resend');
  }
  return env;
}

export type Env = ReturnType<typeof loadEnv>;

let cached: Env | null = null;
export function env(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}

/** Réservé aux tests : force une relecture de l'environnement. */
export function resetEnvCache() {
  cached = null;
}
