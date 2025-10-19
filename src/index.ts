
import { Hono } from 'hono';
import type { DurableObjectNamespaceLike, DurableObjectStubLike, WorkerEnv } from './env';
import type { DocsSearchResult } from './data/d1';

export type Bindings = WorkerEnv;

export function createApp() {
  const app = new Hono<{ Bindings: Bindings }>();

  app.post('/api/sync/:product', async (c) => {
    const product = c.req.param('product')?.trim();
    if (!product) {
      return c.json({ error: 'Product identifier is required.' }, 400);
    }

    const response = await invokeActor<SyncActorResponse>(
      c.env.PRODUCT_SYNC_ACTOR,
      product,
      'syncProduct',
      { productKey: product }
    );

    return c.json(response);
  });

  app.post('/api/chat/:sessionId', async (c) => {
    const sessionId = c.req.param('sessionId')?.trim() || 'default';
    const body = (await c.req.json<{ query?: string }>().catch(() => ({}))) as {
      query?: string;
    };

    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query) {
      return c.json({ error: 'Query is required.' }, 400);
    }

    const response = await invokeActor<ChatActorResponse>(
      c.env.CHAT_SESSION_ACTOR,
      sessionId,
      'handleUserQuery',
      { sessionId, query }
    );

    return c.json(response);
  });

  app.get('/healthz', (c) => c.json({ status: 'ok' }));

  app.notFound((c) => c.json({ error: 'Not Found' }, 404));

  app.onError((error, c) => {
    console.error('Unhandled worker error', error);
    return c.json({ error: 'Internal Server Error' }, 500);
  });

  return app;
}

const app = createApp();
export default app;

type SyncActorResponse = {
  lastSyncTimestamp: number;
  syncStatus: 'idle' | 'in_progress' | 'success' | 'failed';
  message?: string;
};

type ChatActorResponse = {
  reply: string;
  citations: DocsSearchResult[];
  historyLength: number;
};

async function invokeActor<T>(
  namespace: DurableObjectNamespaceLike,
  name: string,
  method: string,
  params: Record<string, unknown>
): Promise<T> {
  const stub = namespace.getByName(name);
  await ensureActorName(stub, name);

  const response = await stub.fetch('https://actor.local/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => 'Actor invocation failed.');
    throw new Error(`Actor ${name} responded with ${response.status}: ${message}`);
  }

  return (await response.json()) as T;
}

async function ensureActorName(stub: DurableObjectStubLike, name: string) {
  const maybe = (stub as unknown as { setName?: (id: string) => Promise<void> }).setName;
  if (typeof maybe === 'function') {
    try {
      await maybe.call(stub, name);
    } catch (error) {
      console.warn('Failed to set actor name via Actors SDK helper.', error);
    }
  }
}

