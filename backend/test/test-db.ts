import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Base de test : TEST_DATABASE_URL, ou à défaut la base de .env suffixée « _test ».
 * Par sécurité, les tests refusent de s'exécuter sur une base dont le nom ne se termine pas par « _test ».
 */
export function testDatabaseUrl(): string {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const envFile = join(__dirname, '..', '.env');
    const line = existsSync(envFile) ? readFileSync(envFile, 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL=')) : undefined;
    if (!line) throw new Error('Définissez TEST_DATABASE_URL pour lancer les tests.');
    const u = new URL(line.slice('DATABASE_URL='.length).trim());
    u.pathname = u.pathname.replace(/\/?$/, '') + '_test';
    url = u.toString();
  }
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith('_test')) throw new Error(`Refus d'exécuter les tests sur « ${name} » : le nom de la base doit finir par _test.`);
  return url;
}
