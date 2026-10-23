/**
 * Maintenance ponctuelle :
 *   pnpm --filter backend maintenance -- --drain     exécute toutes les tâches en attente
 *   pnpm --filter backend maintenance -- --cleanup   expire les envois abandonnés et supprime les fichiers collectés
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { JobsService } from '../src/jobs/jobs.service';
import { MediaService } from '../src/media/media.service';

async function main() {
  process.env.WORKER_IN_PROCESS = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const args = process.argv.slice(2);
  if (args.includes('--drain')) console.log(`Tâches exécutées : ${await app.get(JobsService).drain(1000)}`);
  if (args.includes('--cleanup')) console.log('Nettoyage :', await app.get(MediaService).cleanup());
  await app.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
