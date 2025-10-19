import { Actor, Persist } from '@cloudflare/actors';
import { MCPAdapter, MCPAdapterEnv } from '../mcpAdapter';
import { D1Env, generateEmbedding, replaceProductDocuments, ProductDocumentRow } from '../d1';

export type ProductSyncStatus = 'idle' | 'in_progress' | 'success' | 'failed';

export interface ProductSyncState {
  productId: string;
  lastSyncTimestamp: number | null;
  syncStatus: ProductSyncStatus;
  lastSyncError: string | null;
  lastSyncCount: number;
}

export type ProductSyncActorEnv = MCPAdapterEnv & D1Env & { AI?: { run: (model: string, input: unknown) => Promise<unknown> }; AI_MODEL?: string };

export class ProductSyncActor extends Actor<ProductSyncActorEnv> {
  private readonly adapter = new MCPAdapter();

  // @ts-expect-error Cloudflare Actors decorator uses the Stage 3 field decorator signature.
  @Persist
  private state: ProductSyncState = {
    productId: '',
    lastSyncTimestamp: null,
    syncStatus: 'idle',
    lastSyncError: null,
    lastSyncCount: 0,
  };

  protected async onInit(): Promise<void> {
    if (!this.state.productId && this.name) {
      this.state.productId = this.name;
    }

    await this.scheduleRecurringSync();
  }

  async scheduleRecurringSync(): Promise<void> {
    const schedules = this.alarms.getSchedules({ type: 'cron' });
    const alreadyScheduled = schedules.some((schedule) => schedule.callback === 'syncProduct');
    if (!alreadyScheduled) {
      await this.alarms.schedule('0 */6 * * *', 'syncProduct');
    }
  }

  async syncProduct(): Promise<{ status: ProductSyncStatus; documents: number }>
  async syncProduct(_: unknown): Promise<{ status: ProductSyncStatus; documents: number }>
  async syncProduct(): Promise<{ status: ProductSyncStatus; documents: number }> {
    this.ensureProductId();
    this.state.syncStatus = 'in_progress';
    this.state.lastSyncError = null;

    try {
      const documents = await this.fetchProductDocuments();
      await replaceProductDocuments(this.env, this.state.productId, documents);
      this.state.lastSyncTimestamp = Date.now();
      this.state.syncStatus = 'success';
      this.state.lastSyncCount = documents.length;
      return { status: this.state.syncStatus, documents: documents.length };
    } catch (error) {
      this.state.syncStatus = 'failed';
      this.state.lastSyncError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async getStatus(): Promise<ProductSyncState> {
    this.ensureProductId();
    return { ...this.state };
  }

  protected async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const [, action] = url.pathname.split('/');

    if (request.method === 'POST' && action === 'sync') {
      try {
        const result = await this.syncProduct();
        return Response.json(result);
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error ? error.message : 'Sync failed',
            status: this.state.syncStatus,
          },
          { status: 500 }
        );
      }
    }

    if (request.method === 'GET' && action === 'status') {
      return Response.json(await this.getStatus());
    }

    return new Response('Not Found', { status: 404 });
  }

  private ensureProductId(): void {
    if (!this.state.productId) {
      if (!this.name) {
        throw new Error('Product identifier could not be determined.');
      }
      this.state.productId = this.name;
    }
  }

  private async fetchProductDocuments(): Promise<
    Array<Omit<ProductDocumentRow, 'id' | 'product_id' | 'last_synced_at'> & { id?: string }>
  > {
    if (!this.state.productId) {
      throw new Error('Product identifier is not set.');
    }

    const query = `product:${this.state.productId}`;
    const searchResponse = await this.adapter.proxySearchDocs(this.env, { query, topK: 10 });

    const documents: Array<Omit<ProductDocumentRow, 'id' | 'product_id' | 'last_synced_at'> & { id?: string }> = [];

    for (const [index, result] of searchResponse.results.entries()) {
      const embedding = await generateEmbedding(this.env, result.content);
      documents.push({
        id: result.id ?? `${this.state.productId}-${index}`,
        title: result.title,
        url: result.url ?? '',
        content: result.content,
        embedding,
      });
    }

    return documents;
  }
}

export type ProductSyncActorStub = ReturnType<typeof ProductSyncActor.get>;
