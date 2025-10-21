import { describe, it, expect, beforeEach, vi } from 'vitest';

class MockWebSocket {
  peer?: MockWebSocket;
  messages: unknown[] = [];
  readyState = 1;
  private listeners: Record<string, ((event: { data: unknown }) => void)[]> = {};

  setPeer(peer: MockWebSocket) {
    this.peer = peer;
  }

  accept() {}

  send(data: unknown) {
    this.messages.push(data);
    if (this.peer) {
      const callbacks = this.peer.listeners['message'] || [];
      for (const cb of callbacks) {
        cb({ data });
      }
    }
  }

  addEventListener(type: string, handler: (event: { data: unknown }) => void) {
    this.listeners[type] ??= [];
    this.listeners[type].push(handler);
  }

  close() {}
}

globalThis.WebSocketPair = class {
  readonly 0;
  readonly 1;
  constructor() {
    const client = new MockWebSocket();
    const server = new MockWebSocket();
    client.setPeer(server);
    server.setPeer(client);
    this[0] = client;
    this[1] = server;
  }
};

const jsonResponse = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
    ...init,
  });

const createWebSocketResponse = (socket: any) => {
  const response = new Response(null, { status: 200 });
  Object.defineProperty(response, 'status', { value: 101 });
  Object.defineProperty(response, 'webSocket', { value: socket });
  return response as Response & { webSocket: any };
};

const worker = {
  async fetch(request: Request, env: any) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health/status') {
      const stmt = env.DB.prepare('SELECT * FROM health_checks ORDER BY timestamp DESC LIMIT 1');
      const latest = await stmt.first();
      return latest ? jsonResponse(latest) : jsonResponse({ message: 'No health checks run yet' }, { status: 404 });
    }

    if (url.pathname === '/api/chat') {
      if (request.headers.get('X-API-Key') !== env.WORKER_API_KEY) {
        return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
      }
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      const body = (await request.json()) as { query: string; sessionId?: string };
      const sessionId = body.sessionId ?? 'generated-session';
      const actor = env.CHAT_SESSION_ACTOR.get(env.CHAT_SESSION_ACTOR.idFromName(sessionId));
      const actorResponse = await actor.fetch('https://actor.local', {
        method: 'POST',
        body: JSON.stringify({ query: body.query, sessionId }),
      });
      const text = await actorResponse.text();
      return new Response(text, { status: actorResponse.status, headers: { 'content-type': 'application/json' } });
    }

    if (url.pathname === '/api/chat/ws') {
      if (request.headers.get('X-API-Key') !== env.WORKER_API_KEY) {
        return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
      }
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }
      const sessionId = 'ws-session';
      const actor = env.CHAT_SESSION_ACTOR.get(env.CHAT_SESSION_ACTOR.idFromName(sessionId));
      const actorResponse = await actor.fetch('https://actor.local/ws', { headers: { Upgrade: 'websocket' } });
      const response = createWebSocketResponse(actorResponse.webSocket);
      response.headers.set('x-session-id', sessionId);
      return response;
    }

    return new Response('Not Found', { status: 404 });
  },
};

function createD1() {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return this;
        },
        first: vi.fn().mockResolvedValue(
          sql.includes('health_checks')
            ? { id: 1, timestamp: '2024-01-01T00:00:00Z', overall_status: 'PASS', results_data: '{}' }
            : null,
        ),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue({}),
      };
    },
  } as any;
}

describe('E2E chat flows', () => {
  const actorFetch = vi.fn();
  const actorStub = { fetch: actorFetch };
  const env = {
    WORKER_API_KEY: 'test-key',
    DB: createD1(),
    CHAT_SESSION_ACTOR: {
      idFromName: (name: string) => name,
      get: vi.fn(() => actorStub),
    },
  } as any;
  const ctx = { waitUntil: vi.fn() } as any;

  beforeEach(() => {
    actorFetch.mockReset();
  });

  it('returns latest health status', async () => {
    const request = new Request('https://example.com/api/health/status');
    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({ overall_status: 'PASS' });
  });

  it('proxies chat request to actor', async () => {
    actorFetch.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      expect(body).toMatchObject({ query: 'Explain Workers AI', sessionId: 'session-42' });
      return jsonResponse({
        sessionId: body.sessionId,
        response: 'Workers AI provides serverless GPUs.',
        plan: { steps: ['step 1'], toolCalls: [] },
      });
    });

    const request = new Request('https://example.com/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({ query: 'Explain Workers AI', sessionId: 'session-42' }),
    });

    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({ response: 'Workers AI provides serverless GPUs.' });
  });

  it('streams websocket messages in order', async () => {
    actorFetch.mockImplementation(async (url) => {
      if (String(url).endsWith('/ws')) {
        const pair = new WebSocketPair();
        const server = pair[1];
        server.accept();
        server.addEventListener('message', () => {
          server.send(JSON.stringify({ type: 'plan_created', payload: {} }));
          server.send(JSON.stringify({ type: 'tool_start', payload: { tool: 'sandbox' } }));
          server.send(JSON.stringify({ type: 'tool_end', payload: { tool: 'sandbox' } }));
          server.send(JSON.stringify({ type: 'final_response', payload: { response: 'done' } }));
        });
        return createWebSocketResponse(pair[0]);
      }
      return jsonResponse({ error: 'Unhandled request' }, { status: 500 });
    });

    const request = new Request('https://example.com/api/chat/ws', {
      headers: {
        Upgrade: 'websocket',
        'X-API-Key': 'test-key',
      },
    });

    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(101);
    const ws = response.webSocket as unknown as MockWebSocket;
    const received: string[] = [];
    ws.addEventListener('message', (event) => received.push(String(event.data)));
    ws.accept();
    ws.send(JSON.stringify({ query: 'Hello' }));

    expect(received).toEqual([
      JSON.stringify({ type: 'plan_created', payload: {} }),
      JSON.stringify({ type: 'tool_start', payload: { tool: 'sandbox' } }),
      JSON.stringify({ type: 'tool_end', payload: { tool: 'sandbox' } }),
      JSON.stringify({ type: 'final_response', payload: { response: 'done' } }),
    ]);
  });
});
