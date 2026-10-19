/**
 * Creates an admin account, or promotes an existing user to admin.
 * Credentials are typed interactively and never stored in files or env vars.
 *
 *   npm run admin:create -w @fm/api                       (local)
 *   docker compose exec api npm run admin:create          (Docker)
 */
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as readline from 'node:readline';

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Echo nothing while the password is typed.
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
        if (s.startsWith(question)) process.stdout.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function main() {
  if (!process.stdin.isTTY) {
    throw new Error('Run this in an interactive terminal (with docker compose exec, not -T).');
  }
  const prisma = new PrismaClient();
  try {
    const email = (await ask('Admin email: ')).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Invalid email');

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const answer = await ask(`User ${email} exists (${existing.role}). Make admin and reset password? [y/N] `);
      if (answer.toLowerCase() !== 'y') return console.log('Cancelled.');
    }

    const password = await ask('Password (min 12 chars): ', true);
    if (password.length < 12) throw new Error('Password must be at least 12 characters');
    if ((await ask('Repeat password: ', true)) !== password) throw new Error('Passwords do not match');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.upsert({
      where: { email },
      // Bumping sessionVersion signs out any existing sessions of that account.
      update: { role: Role.ADMIN, passwordHash, status: 'ACTIVE', sessionVersion: { increment: 1 } },
      create: { email, passwordHash, name: 'Admin', role: Role.ADMIN },
    });
    await prisma.auditLog.create({
      data: { action: existing ? 'admin.promote_cli' : 'admin.create_cli', entityType: 'User', entityId: user.id },
    });
    console.log(`Admin ${email} is ready. Log in at /login.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
