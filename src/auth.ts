/**
 * @file src/auth.ts
 * @description Authentication middleware for the Hono router.
 */

import { createMiddleware } from 'hono/factory';
import type { Bindings } from './env';

/**
 * Authentication middleware.
 * Verifies the 'X-API-Key' header against the WORKER_API_KEY secret.
 */
export const authMiddleware = createMiddleware<{ Bindings: Bindings }>(async (c, next) => {
  const apiKey = c.req.header('X-API-Key');
  if (!apiKey || apiKey !== c.env.WORKER_API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});
