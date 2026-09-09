import { IpRateLimiter } from "./rate-limit";

describe("IP rate limiter", () => {
  it("aynı kapsam ve IP için pencere içinde üst sınırı uygular", () => {
    let now = 1_000;
    const limiter = new IpRateLimiter(() => now);
    const config = { windowMs: 10_000, max: 2 };
    expect(limiter.check("login", "203.0.113.10", config)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check("login", "203.0.113.10", config)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.check("login", "203.0.113.10", config)).toMatchObject({ allowed: false, remaining: 0, retryAfterSeconds: 10 });
    now += 10_001;
    expect(limiter.check("login", "203.0.113.10", config)).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("kapsamları ve IP adreslerini birbirinden ayırır", () => {
    const limiter = new IpRateLimiter(() => 1_000);
    const config = { windowMs: 10_000, max: 1 };
    expect(limiter.check("login", "203.0.113.10", config).allowed).toBe(true);
    expect(limiter.check("login", "203.0.113.11", config).allowed).toBe(true);
    expect(limiter.check("chat", "203.0.113.10", config).allowed).toBe(true);
  });
});
