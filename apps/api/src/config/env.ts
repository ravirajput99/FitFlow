import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { z } from 'zod';

/**
 * Loads the repo-root .env (when present) and validates environment variables once at
 * startup, so a misconfigured deploy fails fast instead of at the first request.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1),
    API_PORT: z.coerce.number().int().default(4000),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).default(30),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    OTP_PROVIDER: z.enum(['log', 'msg91']).default('log'),
    /** Requests per minute allowed on each public auth endpoint, per client IP. */
    AUTH_RATE_LIMIT: z.coerce.number().int().min(1).default(10),
    /** Requests per minute for everything else: per user when logged in, else per IP. */
    API_RATE_LIMIT: z.coerce.number().int().min(1).default(300),
    /**
     * Which proxies may set X-Forwarded-For (Express "trust proxy" syntax): "loopback",
     * a comma-separated list of IPs/CIDRs, a hop count, or "false". Rate limits are keyed
     * on the client IP, so trusting too much lets clients spoof it.
     */
    TRUST_PROXY: z
      .string()
      .default('loopback')
      .transform((v): boolean | number | string =>
        v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? Number(v) : v,
      ),
    /** Serve Swagger UI at /docs. Defaults to on, except in production. */
    SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.OTP_PROVIDER === 'log') {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_PROVIDER'],
        message: 'OTP_PROVIDER=log prints login codes to the console; not allowed in production',
      });
    }
    if (/change-me/i.test(env.JWT_ACCESS_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'JWT_ACCESS_SECRET is still the example value; generate a random secret',
      });
    }
    if (env.TRUST_PROXY === true) {
      ctx.addIssue({
        code: 'custom',
        path: ['TRUST_PROXY'],
        message: 'TRUST_PROXY=true lets any client spoof its IP; list your proxy addresses instead',
      });
    }
  });

export type Env = z.output<typeof envSchema>;

let cached: Env | undefined;

function loadDotEnv() {
  // Works whether the API is started from apps/api or from the repo root.
  for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
    if (existsSync(candidate)) {
      // Assign into process.env ourselves (rather than process.loadEnvFile) so it also works
      // in sandboxes like Jest that give each test file its own process.env object.
      // Variables already set in the environment win over the file.
      for (const [key, value] of Object.entries(parseEnv(readFileSync(candidate, 'utf8')))) {
        process.env[key] ??= value;
      }
      return;
    }
  }
}

export function env(): Env {
  if (cached) return cached;
  loadDotEnv();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${details.join('\n')}`);
  }
  cached = parsed.data;
  return cached;
}
