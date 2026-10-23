import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { env } from './config/env';
import { JobsService } from './jobs/jobs.service';

/**
 * Worker : traitements asynchrones (médias, invalidation du cache, nettoyage, promotions).
 * Déployé comme service séparé de l'API (Render « Background Worker ») ; plusieurs instances possibles.
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  app.enableShutdownHooks();
  app.get(JobsService).start();
  new Logger('Worker').log(`Worker TogoMobile démarré (${env().nodeEnv})`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
