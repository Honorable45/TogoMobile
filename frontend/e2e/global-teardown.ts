import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

/** Supprime les comptes, boutiques et produits créés par les tests, ainsi que l'administrateur de test. */
export default function globalTeardown() {
  execFileSync('pnpm', ['--filter', 'backend', 'seed:clear-e2e'], { cwd: join(__dirname, '..', '..'), stdio: 'pipe' });
  rmSync(join(__dirname, '.admin.json'), { force: true });
}
