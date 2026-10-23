import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { ThrottlerStorageService, type ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';

/**
 * Compteurs de limitation de débit partagés entre toutes les instances de l'API (Redis).
 * Fenêtre fixe par clé, opération atomique (script Lua). Les compteurs sont jetables :
 * si Redis est indisponible, on bascule sur des compteurs en mémoire (par instance) plutôt que
 * de refuser le trafic ; aucune donnée métier ne dépend de Redis.
 */
const SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl <= 0 and hits > tonumber(ARGV[2]) and tonumber(ARGV[3]) > 0 then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  blockTtl = tonumber(ARGV[3])
end
return {hits, ttl, blockTtl}`;

export class RedisThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly logger = new Logger('RedisThrottler');
  readonly redis: Redis;
  private readonly fallback = new ThrottlerStorageService();
  private lastWarning = 0;

  constructor(url: string) {
    this.redis = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 2000, commandTimeout: 500 });
    this.redis.on('error', (e) => this.warn(e.message));
    this.redis.defineCommand('tmThrottle', { numberOfKeys: 2, lua: SCRIPT });
  }

  private warn(message: string) {
    if (Date.now() - this.lastWarning < 60_000) return;
    this.lastWarning = Date.now();
    this.logger.warn(`Redis indisponible, compteurs en mémoire utilisés : ${message}`);
  }

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottlerStorageRecord> {
    if (this.redis.status !== 'ready' && this.redis.status !== 'connecting' && this.redis.status !== 'connect') {
      this.warn(`état ${this.redis.status}`);
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
    try {
      return await this.incrementRedis(key, ttl, limit, blockDuration, throttlerName);
    } catch (e) {
      this.warn((e as Error).message);
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }

  private async incrementRedis(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottlerStorageRecord> {
    const base = `tm:throttle:${throttlerName}:${key}`;
    const run = (this.redis as unknown as { tmThrottle: (...a: Array<string | number>) => Promise<[number, number, number]> }).tmThrottle;
    const [hits, ttlMs, blockMs] = await run.call(this.redis, `${base}:hits`, `${base}:block`, ttl, limit, blockDuration);
    const isBlocked = hits > limit || blockMs > 0;
    return {
      totalHits: hits,
      timeToExpire: Math.max(0, Math.ceil(ttlMs / 1000)),
      isBlocked,
      timeToBlockExpire: isBlocked ? Math.max(1, Math.ceil((blockMs > 0 ? blockMs : ttlMs) / 1000)) : 0,
    };
  }

  async onApplicationShutdown() {
    this.fallback.onApplicationShutdown();
    await this.redis.quit().catch((e: Error) => this.logger.warn(`Fermeture Redis : ${e.message}`));
  }
}
