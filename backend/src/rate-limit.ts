import { Injectable } from "@nestjs/common";

export type RateLimitConfig = { windowMs: number; max: number };

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

type Clock = () => number;

/**
 * Process-local sliding-window limiter for low-volume control-plane endpoints.
 * A distributed deployment should replace this store with Redis or a gateway.
 */
@Injectable()
export class IpRateLimiter {
  private readonly buckets = new Map<string, number[]>();

  constructor(private readonly now: Clock = () => Date.now()) {}

  check(scope: string, ip: string | undefined, config: RateLimitConfig): RateLimitDecision {
    const current = this.now();
    const key = `${scope}:${ip?.trim() || "unknown"}`;
    const threshold = current - config.windowMs;
    const recent = (this.buckets.get(key) ?? []).filter((timestamp) => timestamp > threshold);
    const allowed = recent.length < config.max;
    if (allowed) recent.push(current);
    this.buckets.set(key, recent);

    const oldest = recent[0] ?? current;
    return {
      allowed,
      limit: config.max,
      remaining: Math.max(config.max - recent.length, 0),
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((oldest + config.windowMs - current) / 1000)),
    };
  }

  clear() {
    this.buckets.clear();
  }
}
