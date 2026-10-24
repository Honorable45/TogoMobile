#!/usr/bin/env node
/**
 * Préparation des variables d'environnement de déploiement (backend, frontend, admin).
 *
 *   node scripts/prepare-env.mjs --env production --domain <domaine>     génère deploy/secrets/production/*.env
 *   node scripts/prepare-env.mjs --env staging --domain <domaine>        préproduction (sous-domaines *-staging)
 *   node scripts/prepare-env.mjs --check deploy/secrets/production       vérifie des fichiers complétés
 *   node scripts/prepare-env.mjs --examples                              régénère deploy/examples (sans secret)
 *
 *   node scripts/prepare-env.mjs --env production --no-domain             sans domaine : adresses gratuites
 *                                                                        *.vercel.app / *.onrender.com / r2.dev
 *
 * Stockage des médias : Cloudinary par défaut ; --storage r2 pour Cloudflare R2 (ou tout S3).
 *
 * Options : --site-host www (défaut ; « @ » pour servir le site sur le domaine nu), --force (écraser),
 *           --site-url / --admin-url / --api-url (adresse exacte si l'hébergeur a ajouté un suffixe).
 *
 * Les secrets (APP_SECRET, REVALIDATE_SECRET, METRICS_TOKEN) sont générés aléatoirement et distincts par
 * environnement. Les valeurs qui dépendent d'un compte externe (base, Cloudinary/R2, Resend, Redis) restent vides et
 * marquées « À RENSEIGNER » : aucune valeur n'est inventée. Les fichiers générés contiennent des secrets :
 * le dossier deploy/secrets est ignoré par Git ; ne les commitez jamais.
 */
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TODO = 'À RENSEIGNER';
const secret = (bytes = 36) => randomBytes(bytes).toString('base64url');

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else out[a.slice(2)] = argv[++i];
  }
  return out;
}

/** Adresses publiques d'un environnement. */
function hosts(env, domain, siteHost, storage = 'cloudinary') {
  const sfx = env === 'staging' ? '-staging' : '';
  if (!domain) {
    // Adresses attribuées gratuitement d'après le nom du projet Vercel / du service Render. Si le nom est déjà
    // pris, l'hébergeur ajoute un suffixe : corriger alors avec --site-url, --admin-url ou --api-url.
    const site = `https://togomobile${sfx}.vercel.app`;
    return {
      site,
      origins: [site],
      api: `https://togomobile-api${sfx}.onrender.com`,
      admin: `https://togomobile-admin${sfx}.vercel.app`,
      media: null, // URL r2.dev attribuée par Cloudflare à l'activation de l'accès public du bucket
      bucket: `togomobile-media${sfx}`,
      // Sans domaine vérifié, Resend n'envoie qu'à l'adresse du titulaire du compte (voir commentaire MAIL_FROM).
      mailFrom: 'TogoMobile <onboarding@resend.dev>',
      noDomain: true,
      storage,
    };
  }
  const site =
    env === 'staging' ? `https://staging.${domain}` : siteHost === '@' ? `https://${domain}` : `https://${siteHost}.${domain}`;
  const origins = env === 'production' ? [...new Set([site, `https://${domain}`, `https://www.${domain}`])] : [site];
  return {
    site,
    origins,
    api: `https://api${sfx}.${domain}`,
    admin: `https://admin${sfx}.${domain}`,
    media: `https://media${sfx}.${domain}`,
    bucket: `togomobile-media${sfx}`,
    mailFrom: `TogoMobile <no-reply@${domain}>`,
    storage,
  };
}

/**
 * Chaque entrée : [clé, valeur, commentaire] ou une ligne de section (chaîne).
 * Une valeur `null` signifie « à renseigner » (obligatoire) ; '' signifie facultatif.
 */
function templates(env, h, s) {
  const staging = env === 'staging';
  return {
    backend: [
      '# ─── API + worker (Render) — à saisir dans le groupe de variables « togomobile-shared » ───',
      '# Le service web et le worker utilisent les mêmes valeurs. PORT est fourni par Render.',
      ['NODE_ENV', 'production', 'Toujours « production » sur Render, y compris en préproduction.'],
      ['DATABASE_URL', null, 'Render → la base PostgreSQL → Connect → « Internal Database URL » (même région que l’API), puis ajouter ?connection_limit=10 à la fin. URL externe (Neon, Supabase…) : ?sslmode=require&connection_limit=10.'],
      ['APP_SECRET', s.appSecret, 'HMAC des numéros d’acheteurs. NE JAMAIS LE CHANGER une fois en production.'],
      '# ─── Adresses ───',
      ['WEB_URL', h.site],
      ['API_URL', h.api],
      ['ADMIN_URL', h.admin, 'Origine autorisée de l’application d’administration.'],
      ['CORS_ORIGINS', h.origins.join(',')],
      '# ─── Session ───',
      ['SESSION_COOKIE_NAME', 'tm_session', 'Identique dans le frontend et l’admin.'],
      ['SESSION_COOKIE_SAMESITE', 'lax'],
      ['SESSION_COOKIE_DOMAIN', '', 'Laisser vide : sessions du site et de l’admin séparées.'],
      ['SESSION_DAYS', '30'],
      ['TRUST_PROXY_HOPS', '2', 'Vercel puis Render. À vérifier avec GET /api/v1/admin/debug/client-ip.'],
      ...(h.storage === 'r2'
        ? [
            '# ─── Stockage des médias (Cloudflare R2) ───',
            ['STORAGE_DRIVER', 's3'],
            ['S3_BUCKET', h.bucket, 'Nom du bucket à créer (modifiable).'],
            ['S3_REGION', 'auto'],
            ['S3_ENDPOINT', null, 'Cloudflare → R2 → Overview → « Account Details » → S3 API : https://<ID_COMPTE>.r2.cloudflarestorage.com (sans le nom du bucket à la fin).'],
            ['S3_ACCESS_KEY_ID', null, 'Cloudflare → R2 → « Manage API Tokens » → Create API Token → permission « Object Read & Write », limité au bucket → « Access Key ID ».'],
            ['S3_SECRET_ACCESS_KEY', null, 'Même écran : « Secret Access Key » (affichée une seule fois).'],
            h.media
              ? ['S3_PUBLIC_URL', h.media, 'Domaine public du bucket (R2 → bucket → Settings → Custom Domains).']
              : ['S3_PUBLIC_URL', null, 'R2 → bucket → Settings → Public Access → « R2.dev subdomain » → Allow : https://pub-<id>.r2.dev. Limité en débit par Cloudflare : passer à un domaine personnalisé avant un vrai trafic.'],
          ]
        : [
            '# ─── Stockage des médias (Cloudinary) ───',
            ['STORAGE_DRIVER', 'cloudinary'],
            ['CLOUDINARY_URL', null, 'cloudinary.com → Settings → API Keys : variable « CLOUDINARY_URL » au format cloudinary://<api_key>:<api_secret>@<cloud_name> (bouton « Copy »).'],
            ['CLOUDINARY_FOLDER', `togomobile${staging ? '-staging' : ''}`, 'Dossier racine des médias dans le compte (sépare production et préproduction).'],
          ]),
      ['MEDIA_MAX_IMAGE_MB', '8'],
      ['MEDIA_MAX_VIDEO_MB', '40'],
      ['MEDIA_MAX_VIDEO_SECONDS', '90'],
      ['MEDIA_UPLOAD_TTL_SECONDS', '900'],
      ['MEDIA_PROCESSING', 'queue'],
      ['MEDIA_TRANSCODE_VIDEO', 'true'],
      ['FFMPEG_PATH', '', 'Vide : binaire du paquet ffmpeg-static.'],
      '# ─── Worker et montée en charge ───',
      ['WORKER_IN_PROCESS', 'false', 'Le worker est un service Render séparé.'],
      ['WORKER_CONCURRENCY', '2'],
      ['WORKER_POLL_MS', '1000'],
      ['WEB_CONCURRENCY', '1', 'Processus par instance ; au-delà de 1, renseigner REDIS_URL.'],
      ['REDIS_URL', '', 'Facultatif ; obligatoire dès plusieurs instances ou processus. Render → Key Value → Connect → « Internal Key Value URL ».'],
      ['RATE_LIMIT_PER_MINUTE', '120'],
      ['PAGINATION_MAX_OFFSET', '5000'],
      '# ─── Cache ───',
      ['PUBLIC_CACHE_SECONDS', '30'],
      ['WEB_REVALIDATE_URL', `${h.site}/api/revalidate`],
      ['REVALIDATE_SECRET', s.revalidate, 'Identique dans le frontend.'],
      '# ─── Observabilité ───',
      ['METRICS_TOKEN', s.metrics, 'Jeton Bearer de /api/v1/metrics (collecte Prometheus).'],
      ['SLOW_QUERY_MS', '500'],
      ['SLOW_REQUEST_MS', '1500'],
      '# ─── Sécurité ───',
      ['LOGIN_MAX_FAILURES', '8'],
      ['LOGIN_LOCK_MINUTES', '15'],
      ['SWAGGER_ENABLED', staging ? 'true' : 'false'],
      '# ─── E-mails (Resend) ───',
      ['MAIL_DRIVER', 'resend'],
      h.noDomain
        ? ['MAIL_FROM', h.mailFrom, 'SANS DOMAINE : Resend n’envoie qu’à l’adresse e-mail du titulaire du compte. Les clients ne recevront pas les e-mails de mot de passe oublié tant qu’un domaine n’est pas vérifié dans Resend (puis no-reply@<domaine>).']
        : ['MAIL_FROM', h.mailFrom, 'Le domaine d’envoi doit être vérifié dans Resend (Domains → Add Domain, puis enregistrements DNS).'],
      ['RESEND_API_KEY', null, 'resend.com → API Keys → Create API Key → permission « Sending access » (commence par re_).'],
      '# ─── Règles anti-abus ───',
      ['RULE_MAX_SALES_PER_DAY', '30'],
      ['RULE_MAX_SALES_PER_DAY_NEW_SHOP', '5'],
      ['RULE_REVIEW_TOKEN_DAYS', '60'],
      ['RULE_REFERENCE_PRICE_DAYS', '30'],
      ['RULE_MAX_PROMOTION_DAYS', '90'],
      ['ALLOW_DEMO_SEED', 'false', 'Jamais « true » en production.'],
    ],
    frontend: [
      '# ─── Site public + espace vendeur (Vercel, Root Directory « frontend ») ───',
      '# À définir AVANT le build : le relais /api/v1 est figé au moment du build.',
      ['API_URL', h.api],
      ['NEXT_PUBLIC_SITE_URL', h.site],
      ['NEXT_PUBLIC_ADMIN_URL', h.admin],
      ['SESSION_COOKIE_NAME', 'tm_session'],
      ['REVALIDATE_SECRET', s.revalidate, 'Identique à l’API.'],
      ['CACHE_MAX_SECONDS', '300'],
      '# Informations publiques facultatives : n’afficher que ce qui existe réellement.',
      ['NEXT_PUBLIC_CONTACT_EMAIL', ''],
      ['NEXT_PUBLIC_PLATFORM_WHATSAPP', ''],
      ['NEXT_PUBLIC_SOCIAL_FACEBOOK', ''],
      ['NEXT_PUBLIC_SOCIAL_INSTAGRAM', ''],
      ['NEXT_PUBLIC_SOCIAL_TIKTOK', ''],
      ['NEXT_PUBLIC_HERO_IMAGE', ''],
      ['NEXT_PUBLIC_BANNER_IMAGE', ''],
    ],
    admin: [
      '# ─── Administration (Vercel, Root Directory « admin ») ───',
      '# À définir AVANT le build.',
      ['API_URL', h.api],
      ['NEXT_PUBLIC_SITE_URL', h.site],
      ['SESSION_COOKIE_NAME', 'tm_session'],
    ],
  };
}

/** Valeur au format dotenv : entre guillemets si elle contient des espaces ou des caractères spéciaux. */
const quote = (v) => (/^[A-Za-z0-9_\-.:/@,?&=+%]*$/.test(v) ? v : `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);

function render(entries, title) {
  const lines = [title];
  for (const e of entries) {
    if (typeof e === 'string') {
      if (e.startsWith('# ───')) lines.push('');
      lines.push(e);
      continue;
    }
    const [key, value, comment] = e;
    if (value === null) lines.push(`# ${TODO}${comment ? ` — ${comment}` : ''}`);
    else if (comment) lines.push(`# ${comment}`);
    lines.push(`${key}=${quote(value ?? '')}`);
  }
  return `${lines.join('\n').trim()}\n`;
}

function write(file, content, force) {
  if (existsSync(file) && !force) {
    console.error(`✗ ${file} existe déjà : rien n’est écrasé (les secrets ne doivent pas changer). Utilisez --force si c’est voulu.`);
    process.exitCode = 1;
    return false;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, { mode: 0o600 });
  chmodSync(file, 0o600);
  return true;
}

function generate(env, domain, siteHost, force, overrides = {}, storage = 'cloudinary') {
  const h = hosts(env, domain, siteHost, storage);
  for (const k of ['site', 'admin', 'api']) if (overrides[k]) h[k] = overrides[k];
  if (overrides.site) h.origins = [overrides.site];
  const s = { appSecret: secret(48), revalidate: secret(32), metrics: secret(32) };
  const dir = join(ROOT, 'deploy', 'secrets', env);
  const head = (app) =>
    `# TogoMobile — ${app} — ${env === 'staging' ? 'préproduction' : 'production'} (généré le ${new Date().toISOString().slice(0, 10)})\n# CONTIENT DES SECRETS : ne pas commiter, ne pas partager par messagerie. À coller dans Render/Vercel puis à ranger dans un coffre.`;
  const t = templates(env, h, s);
  for (const app of Object.keys(t)) {
    const file = join(dir, `${app}.env`);
    if (write(file, render(t[app], head(app)), force)) console.log(`✓ ${file}`);
  }
  console.log(`\nAdresses : site ${h.site} · admin ${h.admin} · API ${h.api} · médias ${storage === 'r2' ? (h.media ?? 'URL r2.dev à renseigner') : 'Cloudinary (res.cloudinary.com)'}`);
  if (h.noDomain) console.log('Sans domaine : vérifiez après création que Vercel et Render ont bien attribué ces adresses (sinon --site-url, --admin-url, --api-url avec --force).');
  console.log(`Valeurs à compléter : lignes « ${TODO} » (base, ${storage === 'r2' ? 'R2' : 'Cloudinary'}, Resend). Puis : node scripts/prepare-env.mjs --check deploy/secrets/${env}`);
}

function examples() {
  for (const env of ['production', 'staging']) {
    const h = hosts(env, '<domaine>', 'www', 'cloudinary');
    const s = { appSecret: '<généré par scripts/prepare-env.mjs>', revalidate: '<généré, identique API/frontend>', metrics: '<généré>' };
    const t = templates(env, h, s);
    for (const app of Object.keys(t)) {
      const file = join(ROOT, 'deploy', 'examples', env, `${app}.env`);
      mkdirSync(dirname(file), { recursive: true });
      const title = `# TogoMobile — ${app} — ${env === 'staging' ? 'préproduction' : 'production'} — MODÈLE SANS SECRET\n# Généré par : node scripts/prepare-env.mjs --examples. Pour de vrais fichiers : --env ${env} --domain <domaine>.`;
      writeFileSync(file, render(t[app], title));
      console.log(`✓ ${file}`);
    }
  }
}

function parse(file) {
  const vars = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"');
  }
  return vars;
}

function check(dir) {
  const problems = [];
  const warn = [];
  const files = {};
  for (const app of ['backend', 'frontend', 'admin']) {
    const f = join(dir, `${app}.env`);
    if (!existsSync(f)) problems.push(`${app}.env absent`);
    else files[app] = parse(f);
  }
  for (const [app, vars] of Object.entries(files)) {
    for (const [k, v] of Object.entries(vars)) {
      // « <domaine> », « <généré…> » : valeur de modèle jamais remplacée (une adresse « <x@y> » est acceptée).
      if (/<[^@<>]*>/.test(v)) problems.push(`${app} : ${k} contient encore une valeur de modèle (${v.match(/<[^@<>]*>/)[0]})`);
    }
  }
  const b = files.backend ?? {};
  const fr = files.frontend ?? {};
  const ad = files.admin ?? {};
  const isUrl = (v) => /^https:\/\/[^\s/]+[^\s]*$/.test(v ?? '');

  if (files.backend) {
    const storageKeys =
      b.STORAGE_DRIVER === 'cloudinary' ? ['CLOUDINARY_URL'] : ['S3_BUCKET', 'S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_URL'];
    for (const k of ['DATABASE_URL', 'APP_SECRET', 'WEB_URL', 'API_URL', 'ADMIN_URL', 'CORS_ORIGINS', ...storageKeys, 'MAIL_FROM', 'RESEND_API_KEY', 'REVALIDATE_SECRET', 'METRICS_TOKEN']) {
      if (!b[k]) problems.push(`backend : ${k} vide`);
    }
    if (b.DATABASE_URL && !/^postgres(ql)?:\/\//.test(b.DATABASE_URL)) problems.push('backend : DATABASE_URL doit commencer par postgresql://');
    // Les URL internes de Render (hôte sans point, réseau privé) n'ont pas besoin de sslmode.
    const dbHost = (b.DATABASE_URL ?? '').match(/@([^:/?]+)/)?.[1] ?? '';
    if (b.DATABASE_URL && dbHost.includes('.') && !/sslmode=require/.test(b.DATABASE_URL)) warn.push('backend : DATABASE_URL externe sans sslmode=require');
    if (b.DATABASE_URL && !/connection_limit=\d+/.test(b.DATABASE_URL)) warn.push('backend : DATABASE_URL sans connection_limit (pool par défaut de Prisma)');
    if ((b.APP_SECRET ?? '').length < 32) problems.push('backend : APP_SECRET trop court (32 caractères minimum)');
    if (b.REVALIDATE_SECRET && b.REVALIDATE_SECRET.length < 24) problems.push('backend : REVALIDATE_SECRET trop court (24 minimum)');
    if (b.NODE_ENV !== 'production') problems.push('backend : NODE_ENV doit valoir production');
    if (!['s3', 'cloudinary'].includes(b.STORAGE_DRIVER)) problems.push('backend : STORAGE_DRIVER doit valoir cloudinary ou s3 (le disque Render n’est pas persistant)');
    if (b.CLOUDINARY_URL && !/^cloudinary:\/\/[^:\s]+:[^@\s]+@[a-z0-9_-]+$/i.test(b.CLOUDINARY_URL)) problems.push('backend : CLOUDINARY_URL doit avoir la forme cloudinary://<api_key>:<api_secret>@<cloud_name>');
    if (b.MAIL_DRIVER !== 'resend') problems.push('backend : MAIL_DRIVER doit valoir resend');
    if (b.ALLOW_DEMO_SEED === 'true') problems.push('backend : ALLOW_DEMO_SEED=true interdit');
    const urlKeys = b.STORAGE_DRIVER === 'cloudinary' ? [] : ['S3_PUBLIC_URL', 'S3_ENDPOINT'];
    for (const k of ['WEB_URL', 'API_URL', 'ADMIN_URL', ...urlKeys, 'WEB_REVALIDATE_URL']) {
      if (b[k] && !isUrl(b[k])) problems.push(`backend : ${k} doit être une URL https`);
    }
    if (b.WEB_URL && b.CORS_ORIGINS && !b.CORS_ORIGINS.split(',').map((o) => o.trim()).includes(b.WEB_URL)) problems.push('backend : CORS_ORIGINS doit contenir WEB_URL');
    if (Number(b.WEB_CONCURRENCY || 1) > 1 && !b.REDIS_URL) warn.push('backend : WEB_CONCURRENCY > 1 sans REDIS_URL (limitation de débit non partagée)');
    if (/@resend\.dev>?$/.test(b.MAIL_FROM ?? '')) warn.push('backend : MAIL_FROM en @resend.dev — e-mails envoyés uniquement au titulaire du compte Resend (vérifier un domaine)');
    if (/\.r2\.dev$/.test(b.S3_PUBLIC_URL ?? '')) warn.push('backend : S3_PUBLIC_URL en r2.dev — débit limité par Cloudflare, prévoir un domaine personnalisé');
    if (b.SESSION_COOKIE_DOMAIN) warn.push('backend : SESSION_COOKIE_DOMAIN défini — la session sera partagée entre le site et l’admin');
  }
  if (files.frontend) {
    for (const k of ['API_URL', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_ADMIN_URL']) if (!isUrl(fr[k])) problems.push(`frontend : ${k} doit être une URL https`);
    if (!fr.REVALIDATE_SECRET) warn.push('frontend : REVALIDATE_SECRET vide — pas de cache des pages publiques');
  }
  if (files.admin) for (const k of ['API_URL', 'NEXT_PUBLIC_SITE_URL']) if (!isUrl(ad[k])) problems.push(`admin : ${k} doit être une URL https`);

  const same = (label, a, bb) => {
    if (a !== undefined && bb !== undefined && a !== bb) problems.push(`incohérence : ${label}`);
  };
  same('API_URL (backend / frontend)', b.API_URL, fr.API_URL);
  same('API_URL (backend / admin)', b.API_URL, ad.API_URL);
  same('WEB_URL (backend) / NEXT_PUBLIC_SITE_URL (frontend)', b.WEB_URL, fr.NEXT_PUBLIC_SITE_URL);
  same('NEXT_PUBLIC_SITE_URL (frontend / admin)', fr.NEXT_PUBLIC_SITE_URL, ad.NEXT_PUBLIC_SITE_URL);
  same('ADMIN_URL (backend) / NEXT_PUBLIC_ADMIN_URL (frontend)', b.ADMIN_URL, fr.NEXT_PUBLIC_ADMIN_URL);
  same('REVALIDATE_SECRET (backend / frontend)', b.REVALIDATE_SECRET, fr.REVALIDATE_SECRET);
  same('SESSION_COOKIE_NAME (backend / frontend)', b.SESSION_COOKIE_NAME, fr.SESSION_COOKIE_NAME);
  same('SESSION_COOKIE_NAME (backend / admin)', b.SESSION_COOKIE_NAME, ad.SESSION_COOKIE_NAME);
  if (b.WEB_REVALIDATE_URL && b.WEB_URL && b.WEB_REVALIDATE_URL !== `${b.WEB_URL}/api/revalidate`) warn.push('backend : WEB_REVALIDATE_URL ne pointe pas vers WEB_URL/api/revalidate');

  for (const w of warn) console.log(`⚠ ${w}`);
  for (const p of problems) console.log(`✗ ${p}`);
  if (problems.length) {
    console.log(`\n${problems.length} problème(s) à corriger avant le déploiement.`);
    process.exitCode = 1;
  } else console.log(`✓ Variables complètes et cohérentes (${dir})${warn.length ? `, ${warn.length} avertissement(s)` : ''}.`);
}

// « pnpm env:check -- <dossier> » transmet aussi le séparateur « -- » : on l'ignore.
const a = args(process.argv.slice(2).filter((x) => x !== '--'));
if (a.check) check(a.check === true ? join(ROOT, 'deploy', 'secrets', 'production') : a.check);
else if (a.examples) examples();
else if (a.env && (a['no-domain'] || (a.domain && a.domain !== true))) {
  if (!['production', 'staging'].includes(a.env)) {
    console.error('--env : production ou staging');
    process.exit(1);
  }
  const url = (k) => {
    const v = a[k];
    if (v === undefined) return undefined;
    if (v === true || !/^https:\/\/[a-z0-9.-]+$/i.test(String(v).replace(/\/$/, ''))) {
      console.error(`--${k} : URL https attendue, sans chemin`);
      process.exit(1);
    }
    return String(v).replace(/\/$/, '');
  };
  const overrides = { site: url('site-url'), admin: url('admin-url'), api: url('api-url') };
  const storage = a.storage === undefined ? 'cloudinary' : a.storage;
  if (!['cloudinary', 'r2'].includes(storage)) {
    console.error('--storage : cloudinary ou r2');
    process.exit(1);
  }
  if (a['no-domain']) {
    generate(a.env, null, 'www', !!a.force, overrides, storage);
  } else {
    const domain = String(a.domain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
      console.error(`Domaine invalide : ${a.domain}`);
      process.exit(1);
    }
    generate(a.env, domain, a['site-host'] && a['site-host'] !== true ? a['site-host'] : 'www', !!a.force, overrides, storage);
  }
} else {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n?/, '').replace(/^ \* ?/gm, ''));
  process.exitCode = 1;
}
