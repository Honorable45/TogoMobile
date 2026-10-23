import { execSync } from 'node:child_process';
import { testDatabaseUrl } from './test-db';

export default function globalSetup() {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'pipe',
    cwd: __dirname + '/..',
  });
}
