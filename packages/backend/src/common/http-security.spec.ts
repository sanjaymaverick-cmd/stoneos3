import {
  rateLimit,
  rateLimitBucketCount,
  resetRateLimitState,
  securityHeaders,
} from "./http-security";

function response() {
  const headers: Record<string, unknown> = {};
  return {
    headers,
    statusCode: 200,
    body: undefined as unknown,
    setHeader: jest.fn((name: string, value: unknown) => { headers[name] = value; }),
    status: jest.fn(function (this: any, code: number) { this.statusCode = code; return this; }),
    json: jest.fn(function (this: any, body: unknown) { this.body = body; return this; }),
  };
}

describe("HTTP security middleware", () => {
  afterEach(() => {
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    resetRateLimitState();
  });

  it("sets defensive API response headers", () => {
    const res = response();
    const next = jest.fn();
    securityHeaders({} as any, res as any, next);
    expect(res.headers).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("returns 429 after the configured per-IP allowance", () => {
    process.env.RATE_LIMIT_MAX = "2";
    const req = { path: "/expenses", ip: "127.0.0.1", socket: {} };
    const first = response();
    const second = response();
    const third = response();
    rateLimit(req as any, first as any, jest.fn());
    rateLimit(req as any, second as any, jest.fn());
    rateLimit(req as any, third as any, jest.fn());
    expect(third.statusCode).toBe(429);
    expect(third.body).toEqual({ statusCode: 429, message: "Too many requests" });
  });

  it("does not rate-limit health probes", () => {
    process.env.RATE_LIMIT_MAX = "1";
    const req = { path: "/health/ready", ip: "127.0.0.1", socket: {} };
    const next = jest.fn();
    rateLimit(req as any, response() as any, next);
    rateLimit(req as any, response() as any, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("counts each client IP against its own allowance", () => {
    process.env.RATE_LIMIT_MAX = "1";
    const next = jest.fn();
    rateLimit({ path: "/expenses", ip: "10.0.0.1", socket: {} } as any, response() as any, next);
    const otherClient = response();
    rateLimit({ path: "/expenses", ip: "10.0.0.2", socket: {} } as any, otherClient as any, next);
    expect(otherClient.statusCode).toBe(200);
    expect(next).toHaveBeenCalledTimes(2);
  });

  // stoneos3-specific: ston3gpt's version never reclaims bucket entries, so the
  // Map grows once per unique client IP for the life of the process. Guards the
  // sweep that bounds it.
  it("evicts expired buckets instead of growing without bound", () => {
    process.env.RATE_LIMIT_WINDOW_MS = "1";
    const next = jest.fn();
    for (let i = 0; i < 25; i += 1) {
      rateLimit({ path: "/expenses", ip: `10.1.0.${i}`, socket: {} } as any, response() as any, next);
    }
    const before = rateLimitBucketCount();
    expect(before).toBeGreaterThan(1);

    // Windows are 1ms, so every bucket above is already expired. The next
    // request triggers the sweep and reclaims them.
    const done = Date.now() + 5;
    while (Date.now() < done) { /* let the 1ms windows close */ }
    rateLimit({ path: "/expenses", ip: "10.2.0.1", socket: {} } as any, response() as any, next);

    expect(rateLimitBucketCount()).toBeLessThan(before);
  });
});
