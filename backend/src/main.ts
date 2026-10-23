import 'reflect-metadata';
import cluster from 'node:cluster';
import { Logger } from '@nestjs/common';
import { createApp } from './bootstrap';
import { env } from './config/env';

/**
 * WEB_CONCURRENCY > 1 : un processus par cœur (Node n'utilise qu'un cœur par processus).
 * Chaque processus a son propre pool PostgreSQL (connection_limit de DATABASE_URL) :
 * total des connexions = WEB_CONCURRENCY × connection_limit × nombre d'instances.
 * Avec plusieurs processus, configurer REDIS_URL pour partager les compteurs de limitation de débit.
 */
const workers = Number(process.env.WEB_CONCURRENCY || 1);

async function serve() {
  const app = await createApp();
  await app.listen(env().port, '0.0.0.0');
  new Logger('Bootstrap').log(`API TogoMobile démarrée sur le port ${env().port} (${env().nodeEnv}, pid ${process.pid})`);
}

if (workers > 1 && cluster.isPrimary) {
  new Logger('Bootstrap').log(`${workers} processus API`);
  for (let i = 0; i < workers; i++) cluster.fork();
  cluster.on('exit', (w, code) => {
    new Logger('Bootstrap').warn(`Processus ${w.process.pid} arrêté (code ${code}) : redémarrage`);
    cluster.fork();
  });
} else {
  serve().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
