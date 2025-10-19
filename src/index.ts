import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  ProductSyncActor,
  ProductSyncActorEnv,
  ProductSyncActorStub,
} from './actors/ProductSyncActor';
import { ChatSessionActor, ChatSessionActorEnv, ChatSessionActorStub } from './actors/ChatSessionActor';

type Bindings = ProductSyncActorEnv &
  ChatSessionActorEnv & {
    PRODUCT_SYNC_ACTOR: DurableObjectNamespace;
    CHAT_SESSION_ACTOR: DurableObjectNamespace;
  };

const app = new Hono<{ Bindings: Bindings }>();

app.post('/api/sync/product/:id', async (c) => {
  const id = c.req.param('id');
  const actor = ProductSyncActor.get(id);
  const { status, payload } = await callActor(actor, '/sync', { method: 'POST' });
  return respondJson(payload, status);
});

app.get('/api/sync/status/:id', async (c) => {
  const id = c.req.param('id');
  const actor = ProductSyncActor.get(id);
  const { status, payload } = await callActor(actor, '/status');
  return respondJson(payload, status);
});

app.post('/api/chat', async (c) => handleChatRequest(c, crypto.randomUUID()));

app.post('/api/chat/:sessionId', async (c) => handleChatRequest(c, c.req.param('sessionId')));

app.get('/api/chat/:sessionId/history', async (c) => {
  const sessionId = c.req.param('sessionId');
  const actor = ChatSessionActor.get(sessionId);
  const { status, payload } = await callActor(actor, '/history');
  return respondJson(payload, status);
});

app.notFound((c) => c.json({ error: 'Not Found' }, 404));

async function handleChatRequest(c: Context<{ Bindings: Bindings }>, sessionId: string) {
  try {
    const raw = await c.req.json().catch(() => ({}));
    const body = raw as Partial<{ query: string; productId: string; topK: number }>;
    if (!body?.query) {
      return c.json({ error: 'Query is required.' }, 400);
    }

    const actor = ChatSessionActor.get(sessionId);
    const { status, payload } = await callActor(actor, '/query', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });

    if (payload && typeof payload === 'object' && !Array.isArray(payload) && !('sessionId' in payload)) {
      (payload as Record<string, unknown>).sessionId = sessionId;
    }

    return respondJson(payload, status);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Failed to process chat request.' }, 500);
  }
}

async function callActor<T = unknown>(
  actor: ProductSyncActorStub | ChatSessionActorStub,
  path: string,
  init?: RequestInit
): Promise<{ status: number; payload: T | { error: string } }> {
  const response = await actor.fetch(`https://actor${path}`, init);
  const text = await response.text();
  let payload: T | { error: string };

  try {
    payload = text ? (JSON.parse(text) as T) : ({} as T);
  } catch (error) {
    payload = {
      error: `Failed to parse response from actor: ${error instanceof Error ? error.message : 'Unknown error'}`,
    } as { error: string };
  }

  if (!response.ok && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) {
    payload = { error: `Actor responded with status ${response.status}` } as { error: string };
  }

  return { status: response.status, payload };
}

function respondJson(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload ?? null), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default app;
export { ProductSyncActor, ChatSessionActor };
