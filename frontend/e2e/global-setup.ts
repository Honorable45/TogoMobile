import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Crée un administrateur dédié aux tests via le script officiel (aucune route HTTP ne le permet).
 * Les identifiants sont transmis aux tests par un fichier temporaire ignoré par git.
 */
export default function globalSetup() {
  const email = `admin-e2e-${Date.now()}@test.togomobile`;
  const password = `E2e-${Math.random().toString(36).slice(2, 10)}-2026`;
  execFileSync('pnpm', ['--filter', 'backend', 'admin:create', '--', '--email', email, '--name', 'Admin E2E'], {
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, ADMIN_PASSWORD: password },
    stdio: 'pipe',
  });
  writeFileSync(join(__dirname, '.admin.json'), JSON.stringify({ email, password }));
}
