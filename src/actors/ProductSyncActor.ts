/**
 * Durable ProductSyncActor orchestrates ingestion cycles for a single product.
 *
 * The actor keeps lightweight state about the most recent sync and exposes a
 * tiny RPC surface that the HTTP worker can call. Scheduling is handled via the
 * Actors alarm helper so recurring jobs survive evictions.
 */

import { Actor, Persist } from '@cloudflare/actors';

import type { ProductSyncActorEnv } from '../env';

type SyncStatus = 'idle' | 'in_progress' | 'success' | 'failed';

type RpcEnvelope = {
  method: 'syncProduct' | 'getStatus';
  params?: Record<string, unknown>;
};

type SyncResponse = {
  lastSyncTimestamp: number;
  syncStatus: SyncStatus;
  message?: string;
};

export class ProductSyncActor extends Actor<ProductSyncActorEnv> {
  // @ts-expect-error Decorators from @cloudflare/actors use TC39 semantics not yet modelled by tsc
  @Persist
  private lastSyncTimestamp = 0;

  // @ts-expect-error Decorators from @cloudflare/actors use TC39 semantics not yet modelled by tsc
  @Persist
  private syncStatus: SyncStatus = 'idle';

  protected async onInit(): Promise<void> {
    await this.ensureSchedule();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/status') {
      return Response.json(await this.getStatus());
    }

    if (request.method === 'POST' && url.pathname === '/rpc') {
      const payload = (await request.json().catch(() => null)) as RpcEnvelope | null;
      if (!payload || typeof payload.method !== 'string') {
        return Response.json({ error: 'Invalid RPC payload.' }, { status: 400 });
      }

      switch (payload.method) {
        case 'syncProduct': {
          const productKey = typeof payload.params?.productKey === 'string'
            ? payload.params?.productKey
            : undefined;
          return Response.json(await this.syncProduct(productKey));
        }
        case 'getStatus': {
          return Response.json(await this.getStatus());
        }
        default:
          return Response.json({ error: `Unknown RPC method ${payload.method}` }, { status: 400 });
      }
    }

    return Response.json({ error: 'Not Found' }, { status: 404 });
  }

  /**
   * Trigger an ingestion cycle. The implementation intentionally fails fast and
   * leaves a breadcrumb trail that downstream automations can consume.
   */
  async syncProduct(productKey?: string): Promise<SyncResponse> {
    const product = productKey ?? this.name ?? 'default';
    const startedAt = Date.now();

    this.syncStatus = 'in_progress';
    console.log(JSON.stringify({ event: 'product_sync.start', product, actor: this.name, startedAt }));

    try {
      // TODO: wire real ingestion pipeline once available.
      await this.simulateIngestion(product);

      this.lastSyncTimestamp = Date.now();
      this.syncStatus = 'success';

      console.log(JSON.stringify({ event: 'product_sync.success', product, durationMs: Date.now() - startedAt }));
      return this.getStatus();
    } catch (error) {
      this.syncStatus = 'failed';
      const message = error instanceof Error ? error.message : 'Unknown sync failure.';
      console.error('product_sync.failed', { product, message });
      return { ...this.getStatusSnapshot(), message };
    }
  }

  async getStatus(): Promise<SyncResponse> {
    return this.getStatusSnapshot();
  }

  private getStatusSnapshot(): SyncResponse {
    return {
      lastSyncTimestamp: this.lastSyncTimestamp,
      syncStatus: this.syncStatus,
    };
  }

  private async ensureSchedule() {
    const cron = this.env.PRODUCT_SYNC_CRON?.trim() || '0 */6 * * *';
    const existing = this.alarms
      .getSchedules({ type: 'cron' })
      .find((schedule) => schedule.callback === 'runScheduledSync');

    if (existing && 'cron' in existing && existing.cron === cron) {
      return;
    }

    if (existing) {
      await this.alarms.cancelSchedule(existing.id);
    }

    await this.alarms.schedule(cron, 'runScheduledSync', { productKey: this.name });
  }

  /**
   * Alarm callback invoked by the scheduler. Delegates to {@link syncProduct}.
   */
  private async runScheduledSync(payload?: { productKey?: string }) {
    await this.syncProduct(payload?.productKey);
  }

  private async simulateIngestion(productKey: string) {
    // Temporary shim while the ingestion pipeline is ported to Actors.
    await Promise.resolve();
    console.log(JSON.stringify({ event: 'product_sync.noop', product: productKey }));
  }
}
