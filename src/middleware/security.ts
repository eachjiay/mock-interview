import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

export function createRateLimiter(options: { max: number; windowMs?: number; label: string }) {
  const windowMs = options.windowMs || config.apiRateLimitWindowMs;

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${options.label}:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    const bucket = rateBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, {
        count: 1,
        resetAt: now + windowMs
      });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
      res.status(429).json({
        error: 'Too many requests. Please wait and try again.'
      });
      return;
    }

    next();
  };
}

export function requireAdminToken(req: Request, res: Response, next: NextFunction) {
  if (config.nodeEnv !== 'production') {
    next();
    return;
  }

  if (!config.adminApiToken) {
    res.status(503).json({
      error: 'Admin API is disabled because ADMIN_API_TOKEN is not configured.'
    });
    return;
  }

  const headerToken = req.header('x-admin-token') || '';
  const bearerToken = parseBearerToken(req.header('authorization') || '');
  if (headerToken === config.adminApiToken || bearerToken === config.adminApiToken) {
    next();
    return;
  }

  res.status(401).json({
    error: 'Admin token is required.'
  });
}

function parseBearerToken(value: string) {
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}
