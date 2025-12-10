/**
 * @file src/actors/ProductSyncActor.ts
 * @description Stub/deprecated ProductSyncActor maintained for backward compatibility
 * with existing Durable Objects in production.
 *
 * This actor is no longer actively used but must remain exported to support
 * existing Durable Object instances.
 */

import { Actor } from '@cloudflare/actors';
import type { WorkerEnv } from '../env';

/**
 * ProductSyncActor - Deprecated stub class
 *
 * This class exists solely to maintain compatibility with existing Durable Objects.
 * No new instances should be created.
 */
export class ProductSyncActor extends Actor<WorkerEnv> {
  /**
   * Placeholder fetch handler for backward compatibility
   */
  async fetch(request: Request): Promise<Response> {
    return new Response(
      JSON.stringify({
        error: 'ProductSyncActor is deprecated and no longer in use',
        message: 'This Durable Object class is maintained for backward compatibility only',
      }),
      {
        status: 410, // Gone
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
