import { Global, Injectable, Logger, Module, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Job, Prisma } from '@prisma/client';
import { hostname } from 'node:os';
import { env } from '../config/env';
import { jobQueueDepth, jobsProcessed } from '../observability/metrics';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient | PrismaService;
export type JobHandler = (payload: Record<string, unknown>, job: Job) => Promise<void>;
export type PeriodicTask = { name: string; everyMs: number; run: () => Promise<void> };

/** Erreur définitive : la tâche n'est pas retentée (ex. fichier invalide). */
export class PermanentJobError extends Error {}

const STUCK_AFTER_MS = 10 * 60_000;

/**
 * File de tâches persistée dans PostgreSQL.
 * - plusieurs workers peuvent tourner en parallèle (FOR UPDATE SKIP LOCKED) ;
 * - nouvelles tentatives avec délai exponentiel, puis statut FAILED visible et mesuré ;
 * - les tâches bloquées par un arrêt brutal sont reprises automatiquement.
 * Choix : pas de Redis obligatoire ; le volume attendu (traitements de médias, invalidations)
 * reste très inférieur à ce que PostgreSQL absorbe sans difficulté.
 */
@Injectable()
export class JobsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('Jobs');
  private readonly handlers = new Map<string, JobHandler>();
  private readonly periodic: PeriodicTask[] = [];
  private readonly workerId = `${hostname()}:${process.pid}`;
  private timers: NodeJS.Timeout[] = [];
  private running = false;
  private active = 0;

  constructor(private readonly prisma: PrismaService) {}

  register(type: string, handler: JobHandler) {
    this.handlers.set(type, handler);
  }

  registerPeriodic(task: PeriodicTask) {
    this.periodic.push(task);
  }

  enqueue(type: string, payload: Record<string, unknown> = {}, opts: { runAt?: Date; maxAttempts?: number; tx?: Tx } = {}) {
    return (opts.tx ?? this.prisma).job.create({
      data: { type, payload: payload as Prisma.InputJsonValue, runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? 5 },
    });
  }

  onModuleInit() {
    this.registerPeriodic({ name: 'jobs.maintenance', everyMs: 60_000, run: async () => { await this.prune(); await this.refreshQueueMetrics(); } });
    if (env().jobs.inProcessWorker) this.start();
  }

  onApplicationShutdown() {
    this.stop();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.logger.log(`Worker démarré (${this.workerId}, concurrence ${env().jobs.concurrency})`);
    const loop = setInterval(() => void this.tick(), env().jobs.pollMs);
    this.timers.push(loop);
    for (const task of this.periodic) {
      this.timers.push(setInterval(() => void this.runPeriodic(task), task.everyMs));
    }
  }

  stop() {
    this.running = false;
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  /** Réclame et exécute un lot de tâches. Retourne le nombre de tâches traitées. */
  async tick(): Promise<number> {
    const free = env().jobs.concurrency - this.active;
    if (free <= 0) return 0;
    const jobs = await this.claim(free);
    await Promise.all(jobs.map((j) => this.execute(j)));
    return jobs.length;
  }

  /** Exécute toutes les tâches disponibles (tests, commande de maintenance). */
  async drain(max = 100) {
    let total = 0;
    for (let i = 0; i < max; i++) {
      const jobs = await this.claim(5);
      if (!jobs.length) break;
      await Promise.all(jobs.map((j) => this.execute(j)));
      total += jobs.length;
    }
    return total;
  }

  private async claim(limit: number): Promise<Job[]> {
    await this.prisma.$executeRaw`
      UPDATE "Job" SET status = 'PENDING', "lockedAt" = NULL, "lockedBy" = NULL, "updatedAt" = now()
      WHERE status = 'RUNNING' AND "lockedAt" < ${new Date(Date.now() - STUCK_AFTER_MS)}`;
    return this.prisma.$queryRaw<Job[]>`
      UPDATE "Job" SET status = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${this.workerId}, attempts = attempts + 1, "updatedAt" = now()
      WHERE id IN (
        SELECT id FROM "Job" WHERE status = 'PENDING' AND "runAt" <= now()
        ORDER BY "runAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED
      )
      RETURNING *`;
  }

  private async execute(job: Job) {
    const handler = this.handlers.get(job.type);
    this.active++;
    try {
      if (!handler) throw new PermanentJobError(`Aucun gestionnaire pour « ${job.type} »`);
      await handler((job.payload ?? {}) as Record<string, unknown>, job);
      await this.prisma.job.update({ where: { id: job.id }, data: { status: 'DONE', lockedAt: null, lastError: null } });
      jobsProcessed.inc({ type: job.type, outcome: 'done' });
    } catch (e) {
      const message = (e as Error).message?.slice(0, 1000) ?? 'Erreur inconnue';
      const final = e instanceof PermanentJobError || job.attempts >= job.maxAttempts;
      const delay = Math.min(30 * 60_000, 5_000 * 2 ** (job.attempts - 1));
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: final ? 'FAILED' : 'PENDING', lockedAt: null, lastError: message, runAt: final ? undefined : new Date(Date.now() + delay) },
      });
      jobsProcessed.inc({ type: job.type, outcome: final ? 'failed' : 'retry' });
      this.logger.warn(JSON.stringify({ event: 'job_error', type: job.type, id: job.id, attempt: job.attempts, final, message }));
      if (final) await this.onFinalFailure(job, message);
    } finally {
      this.active--;
    }
  }

  private readonly finalFailureHooks = new Map<string, (payload: Record<string, unknown>, message: string) => Promise<void>>();
  onFailure(type: string, hook: (payload: Record<string, unknown>, message: string) => Promise<void>) {
    this.finalFailureHooks.set(type, hook);
  }
  private async onFinalFailure(job: Job, message: string) {
    await this.finalFailureHooks.get(job.type)?.((job.payload ?? {}) as Record<string, unknown>, message).catch((e) =>
      this.logger.error(`Échec du traitement d'échec ${job.type}`, e as Error),
    );
  }

  /** Une seule instance exécute une tâche périodique à la fois (verrou consultatif PostgreSQL). */
  async runPeriodic(task: PeriodicTask) {
    const lockId = Array.from(task.name).reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
    try {
      await this.prisma.$transaction(async (tx) => {
        const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(${lockId}) AS locked`;
        if (locked) await task.run();
      }, { timeout: 5 * 60_000 });
    } catch (e) {
      this.logger.error(`Tâche périodique ${task.name} en échec : ${(e as Error).message}`);
    }
  }

  async refreshQueueMetrics() {
    const rows = await this.prisma.job.groupBy({ by: ['status'], where: { status: { in: ['PENDING', 'RUNNING', 'FAILED'] } }, _count: true });
    for (const s of ['PENDING', 'RUNNING', 'FAILED']) jobQueueDepth.set({ status: s }, rows.find((r) => r.status === s)?._count ?? 0);
  }

  /** Purge des tâches terminées anciennes (les échecs sont conservés 30 jours pour analyse). */
  async prune() {
    await this.prisma.job.deleteMany({ where: { status: 'DONE', updatedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } });
    await this.prisma.job.deleteMany({ where: { status: 'FAILED', updatedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } });
  }
}

@Global()
@Module({ providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
