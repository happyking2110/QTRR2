export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export class MemoryRateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private maxHits: number = 30,
    private windowMs: number = 15 * 60 * 1000,
    private nowFn: () => number = () => Date.now(),
  ) {}

  check(key: string): RateLimitResult {
    const now = this.nowFn();
    const windowStart = now - this.windowMs;

    const timestamps = this.hits.get(key) || [];
    const validTimestamps = timestamps.filter((t) => t > windowStart);

    if (validTimestamps.length >= this.maxHits) {
      this.hits.set(key, validTimestamps);
      return { allowed: false, remaining: 0 };
    }

    validTimestamps.push(now);
    this.hits.set(key, validTimestamps);

    return {
      allowed: true,
      remaining: this.maxHits - validTimestamps.length,
    };
  }

  cleanup(): void {
    const now = this.nowFn();
    const windowStart = now - this.windowMs;

    for (const [key, timestamps] of this.hits.entries()) {
      const valid = timestamps.filter((t) => t > windowStart);
      if (valid.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, valid);
      }
    }
  }

  reset(): void {
    this.hits.clear();
  }
}
