// lib/rate-limiter.ts
export class RateLimiter {
  private lastCall: Map<string, number> = new Map();
  
  async throttle(api: string, delayMs: number = 1000) {
    const last = this.lastCall.get(api) || 0;
    const now = Date.now();
    const elapsed = now - last;
    
    if (elapsed < delayMs) {
      await new Promise(resolve => setTimeout(resolve, delayMs - elapsed));
    }
    
    this.lastCall.set(api, Date.now());
  }
}

export const rateLimiter = new RateLimiter();