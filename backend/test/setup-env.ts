import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testDatabaseUrl } from './test-db';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl();
process.env.WEB_URL = 'http://web.test';
process.env.ADMIN_URL = 'http://admin.test';
process.env.API_URL = 'http://api.test';
process.env.CORS_ORIGINS = 'http://web.test';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = mkdtempSync(join(tmpdir(), 'togomobile-test-'));
process.env.MAIL_DRIVER = 'console';
process.env.APP_SECRET = 'test-secret-test-secret-test-secret-123';
// Cache, invalidation et métriques activés pour être testés (serveur d'invalidation simulé dans scale.spec.ts).
process.env.PUBLIC_CACHE_SECONDS = '30';
process.env.WEB_REVALIDATE_URL = 'http://127.0.0.1:4999/api/revalidate';
process.env.REVALIDATE_SECRET = 'test-revalidate-secret-0123456789';
process.env.METRICS_TOKEN = 'test-metrics-token';
process.env.WORKER_IN_PROCESS = 'false';
