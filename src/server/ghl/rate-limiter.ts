import "server-only";

type Wait = (delayMs: number) => Promise<void>;

type ResourceRateLimit = {
  blockedUntil: number;
  dailyExhausted: boolean;
  intervalMs: number;
  maxRequests: number;
  requestStartedAt: number[];
  turn: Promise<void>;
};

export class GhlRateLimiter {
  readonly #intervalMs: number;
  readonly #maxRequests: number;
  readonly #now: () => number;
  readonly #resources = new Map<string, ResourceRateLimit>();
  readonly #wait: Wait;

  constructor(input: {
    maxRequests: number;
    intervalMs: number;
    now?: () => number;
    wait: Wait;
  }) {
    if (!Number.isInteger(input.maxRequests) || input.maxRequests < 1) {
      throw new Error("GHL rate-limit request budget must be positive");
    }
    if (!Number.isFinite(input.intervalMs) || input.intervalMs <= 0) {
      throw new Error("GHL rate-limit interval must be positive");
    }
    this.#maxRequests = input.maxRequests;
    this.#intervalMs = input.intervalMs;
    this.#now = input.now ?? Date.now;
    this.#wait = input.wait;
  }

  async acquire(resourceId: string): Promise<void> {
    const resource = this.#resource(resourceId);
    let releaseTurn: () => void = () => undefined;
    const currentTurn = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    const previousTurn = resource.turn;
    resource.turn = currentTurn;
    await previousTurn;

    try {
      while (true) {
        if (resource.dailyExhausted) {
          throw new Error(
            `GHL daily request limit exhausted for location ${resourceId}`,
          );
        }
        const now = this.#now();
        resource.requestStartedAt = resource.requestStartedAt.filter(
          (startedAt) => startedAt > now - resource.intervalMs,
        );
        const capacityDelay =
          resource.requestStartedAt.length >= resource.maxRequests
            ? resource.requestStartedAt[0]! + resource.intervalMs - now
            : 0;
        const blockedDelay = resource.blockedUntil - now;
        const delayMs = Math.max(capacityDelay, blockedDelay);
        if (delayMs <= 0) {
          resource.requestStartedAt.push(now);
          return;
        }
        await this.#wait(delayMs);
      }
    } finally {
      releaseTurn();
    }
  }

  blockFor(resourceId: string, delayMs: number): void {
    if (!Number.isFinite(delayMs) || delayMs <= 0) return;
    const resource = this.#resource(resourceId);
    resource.blockedUntil = Math.max(
      resource.blockedUntil,
      this.#now() + delayMs,
    );
  }

  markDailyExhausted(resourceId: string): void {
    this.#resource(resourceId).dailyExhausted = true;
  }

  updateWindow(
    resourceId: string,
    input: { maxRequests?: number; intervalMs?: number },
  ): void {
    const resource = this.#resource(resourceId);
    if (input.maxRequests !== undefined) {
      if (!Number.isInteger(input.maxRequests) || input.maxRequests < 1) return;
      resource.maxRequests = Math.min(resource.maxRequests, input.maxRequests);
    }
    if (
      input.intervalMs !== undefined &&
      Number.isFinite(input.intervalMs) &&
      input.intervalMs > 0
    ) {
      resource.intervalMs = Math.max(resource.intervalMs, input.intervalMs);
    }
  }

  #resource(resourceId: string): ResourceRateLimit {
    const existing = this.#resources.get(resourceId);
    if (existing) return existing;
    const resource: ResourceRateLimit = {
      blockedUntil: 0,
      dailyExhausted: false,
      intervalMs: this.#intervalMs,
      maxRequests: this.#maxRequests,
      requestStartedAt: [],
      turn: Promise.resolve(),
    };
    this.#resources.set(resourceId, resource);
    return resource;
  }
}
