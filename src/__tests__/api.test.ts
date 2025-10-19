import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../index';

function createStub(responseBody: unknown) {
  return {
    fetch: vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    ),
    setName: vi.fn().mockResolvedValue(undefined),
  };
}

describe('HTTP router', () => {
  it('proxies sync requests to the ProductSyncActor', async () => {
    const syncStub = createStub({ lastSyncTimestamp: 123, syncStatus: 'success' });
    const chatStub = createStub({ reply: 'ok', citations: [], historyLength: 1 });
    const app = createApp();
    const env = {
      PRODUCT_SYNC_ACTOR: { getByName: vi.fn().mockReturnValue(syncStub) } as any,
      CHAT_SESSION_ACTOR: { getByName: vi.fn().mockReturnValue(chatStub) } as any,
      DB: {} as any,
    } satisfies Record<string, unknown>;

    const res = await app.fetch(new Request('https://example.com/api/sync/workers', { method: 'POST' }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.syncStatus).toBe('success');
    expect((syncStub.fetch as any).mock.calls[0][0]).toMatch('/rpc');
  });

  it('requires chat queries in the request body', async () => {
    const syncStub = createStub({ lastSyncTimestamp: 123, syncStatus: 'success' });
    const chatStub = createStub({ reply: 'ok', citations: [], historyLength: 1 });
    const app = createApp();
    const env = {
      PRODUCT_SYNC_ACTOR: { getByName: vi.fn().mockReturnValue(syncStub) } as any,
      CHAT_SESSION_ACTOR: { getByName: vi.fn().mockReturnValue(chatStub) } as any,
      DB: {} as any,
    } satisfies Record<string, unknown>;

    const res = await app.fetch(new Request('https://example.com/api/chat/session-1', { method: 'POST' }), env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toMatch(/Query is required/);
  });
});
