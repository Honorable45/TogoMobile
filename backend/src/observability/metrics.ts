import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Métriques Prometheus (exposées sur /api/v1/metrics, protégé par METRICS_TOKEN).
 * Les libellés restent à faible cardinalité : route modèle (/products/:slug), jamais l'URL réelle.
 */
export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'togomobile_' });

export const httpDuration = new Histogram({
  name: 'togomobile_http_request_duration_seconds',
  help: 'Durée des requêtes HTTP',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const authFailures = new Counter({
  name: 'togomobile_auth_failures_total',
  help: 'Échecs d’authentification',
  labelNames: ['reason'] as const,
  registers: [registry],
});

export const uploadFailures = new Counter({
  name: 'togomobile_upload_failures_total',
  help: 'Envois de médias refusés ou en échec',
  labelNames: ['type', 'reason'] as const,
  registers: [registry],
});

export const jobsProcessed = new Counter({
  name: 'togomobile_jobs_total',
  help: 'Tâches asynchrones traitées',
  labelNames: ['type', 'outcome'] as const,
  registers: [registry],
});

export const jobQueueDepth = new Gauge({
  name: 'togomobile_job_queue_depth',
  help: 'Tâches en attente ou en échec',
  labelNames: ['status'] as const,
  registers: [registry],
});

export const slowQueries = new Counter({
  name: 'togomobile_slow_queries_total',
  help: 'Requêtes PostgreSQL dépassant SLOW_QUERY_MS',
  registers: [registry],
});

export const clientErrors = new Counter({
  name: 'togomobile_client_errors_total',
  help: 'Erreurs JavaScript remontées par le site',
  registers: [registry],
});

export const storageBytesUploaded = new Counter({
  name: 'togomobile_storage_uploaded_bytes_total',
  help: 'Octets acceptés dans le stockage objet (suivi des coûts)',
  labelNames: ['type'] as const,
  registers: [registry],
});
