/**
 * Création sécurisée d'un compte administrateur — aucune route HTTP ne permet d'obtenir ce rôle.
 *
 *   pnpm admin:create -- --email admin@exemple.tg --name "Prénom Nom"
 *
 * Le mot de passe est demandé de manière interactive (non affiché, non journalisé),
 * ou lu depuis la variable ADMIN_PASSWORD pour un usage non interactif (CI, shell de l'hébergeur).
 * Si le compte existe déjà, il est promu administrateur et son mot de passe est remplacé.
 */
import { PrismaClient } from '@prisma/client';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { hashPassword } from '../src/common/crypto';

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function askHidden(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, enc, cb) {
      if (!muted) process.stdout.write(chunk, enc);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const email = arg('email')?.trim().toLowerCase();
  const name = arg('name')?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
    throw new Error('Usage : pnpm admin:create -- --email <email> --name "<nom>"');
  }
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    password = await askHidden('Mot de passe (12 caractères minimum) : ');
    const confirm = await askHidden('Confirmez le mot de passe : ');
    if (password !== confirm) throw new Error('Les mots de passe ne correspondent pas.');
  }
  if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('Le mot de passe administrateur doit contenir au moins 12 caractères, dont une lettre et un chiffre.');
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await hashPassword(password);
    const existing = await prisma.user.findUnique({ where: { email }, include: { shop: true } });
    if (existing?.shop) throw new Error('Ce compte possède une boutique : utilisez une adresse distincte pour l’administration.');
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: { role: 'ADMIN', status: 'ACTIVE', passwordHash, name } })
      : await prisma.user.create({ data: { email, name, passwordHash, role: 'ADMIN' } });
    await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await prisma.auditLog.create({ data: { actorId: null, action: 'admin.create_cli', targetType: 'User', targetId: user.id } });
    console.log(`Administrateur ${existing ? 'mis à jour' : 'créé'} : ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
