import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

const mocks = vi.hoisted(() => {
  const analyzeTextMock = vi.fn();
  const structuredResponseToolCtor = vi.fn(() => ({ analyzeText: analyzeTextMock }));
  const embeddingToolCtor = vi.fn(() => ({}));

  const gitHubInstances: any[] = [];
  const GitHubToolMock = vi.fn(() => {
    const instance = {
      searchRepositories: vi.fn().mockResolvedValue([{ repo: 'test' }]),
      searchIssues: vi.fn(),
      getFileContent: vi.fn(),
      getRepoContents: vi.fn(),
      getPullRequestDiff: vi.fn(),
    };
    gitHubInstances.push(instance);
    return instance;
  });

  const browserInstances: any[] = [];
  const BrowserMock = vi.fn(() => {
    const instance = { scrape: vi.fn().mockResolvedValue({ data: [] }) };
    browserInstances.push(instance);
    return instance;
  });

  const sandboxInstances: any[] = [];
  const SandboxMock = vi.fn(() => {
    const instance = {
      exec: vi.fn().mockResolvedValue({ stdout: 'executed' }),
      runScript: vi.fn().mockResolvedValue({ stdout: 'script' }),
    };
    sandboxInstances.push(instance);
    return instance;
  });

  const cloudflareDocsInstances: any[] = [];
  const CloudflareDocsMock = vi.fn(() => {
    const instance = { search: vi.fn().mockResolvedValue({ results: [] }) };
    cloudflareDocsInstances.push(instance);
    return instance;
  });

  const ragInstances: any[] = [];
  const ragSearchMock = vi.fn();
  const RAGToolMock = vi.fn(() => {
    const instance = { searchKnowledgeBase: ragSearchMock };
    ragInstances.push(instance);
    return instance;
  });

  const logTransactionMock = vi.fn().mockResolvedValue(undefined);

  return {
    analyzeTextMock,
    structuredResponseToolCtor,
    embeddingToolCtor,
    gitHubInstances,
    GitHubToolMock,
    browserInstances,
    BrowserMock,
    sandboxInstances,
    SandboxMock,
    cloudflareDocsInstances,
    CloudflareDocsMock,
    ragInstances,
    ragSearchMock,
    RAGToolMock,
    logTransactionMock,
  };
});

const {
  analyzeTextMock,
  structuredResponseToolCtor,
  embeddingToolCtor,
  gitHubInstances,
  GitHubToolMock,
  browserInstances,
  BrowserMock,
  sandboxInstances,
  SandboxMock,
  cloudflareDocsInstances,
  CloudflareDocsMock,
  ragInstances,
  ragSearchMock,
  RAGToolMock,
  logTransactionMock,
} = mocks;

vi.mock('@cloudflare/actors', () => ({
  Actor: class {
    state: any;
    env: any;
    constructor(state: any, env: any) {
      this.state = state;
      this.env = env;
    }
  },
  Persist: () => () => {},
}));

vi.mock('../ai-tools', () => ({
  StructuredResponseTool: mocks.structuredResponseToolCtor,
  EmbeddingTool: mocks.embeddingToolCtor,
}));
vi.mock('../tools/github', () => ({ GitHubTool: mocks.GitHubToolMock }));
vi.mock('../tools/browser', () => ({ BrowserRender: mocks.BrowserMock }));
vi.mock('../tools/sandbox', () => ({ SandboxTool: mocks.SandboxMock }));
vi.mock('../tools/cloudflare_docs', () => ({ CloudflareDocsTool: mocks.CloudflareDocsMock }));
vi.mock('../tools/rag_tool', () => ({ RAGTool: mocks.RAGToolMock }));
vi.mock('../data/d1', () => ({ logTransaction: mocks.logTransactionMock }));
vi.mock('../data/dal', () => ({ DataAccessLayer: class { constructor(public db: any) {} } }));
vi.mock('../data/vectorize_service', () => ({ VectorizeService: class {} }));

let ChatSessionActor: typeof import('./ChatSessionActor').ChatSessionActor;

beforeAll(async () => {
  ({ ChatSessionActor } = await import('./ChatSessionActor'));
});

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

class MockState {
  id = 'state-id';
  storage = {
    map: new Map<string, unknown>(),
    async get<T>(key: string) {
      return this.map.get(key) as T | undefined;
    },
    async put(key: string, value: unknown) {
      this.map.set(key, value);
    },
    async delete(key: string) {
      this.map.delete(key);
    },
  };
}

function createEnv(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    CLOUDFLARE_ACCOUNT_ID: 'acct',
    CLOUDFLARE_API_TOKEN: 'token',
    SANDBOX: {},
    AI: { run: vi.fn().mockResolvedValue({ response: 'Final answer' }) },
    DB: {},
    VECTORIZE_INDEX: {},
    DEFAULT_MODEL_EMBEDDING: '@cf/embed',
    DEFAULT_MODEL_REASONING: '@cf/model',
    ...overrides,
  } as any;
}

describe('ChatSessionActor', () => {
  beforeEach(() => {
    analyzeTextMock.mockReset();
    structuredResponseToolCtor.mockClear();
    embeddingToolCtor.mockClear();
    GitHubToolMock.mockClear();
    BrowserMock.mockClear();
    SandboxMock.mockClear();
    CloudflareDocsMock.mockClear();
    RAGToolMock.mockClear();
    ragSearchMock.mockReset();
    logTransactionMock.mockClear();
    gitHubInstances.length = 0;
    browserInstances.length = 0;
    sandboxInstances.length = 0;
    cloudflareDocsInstances.length = 0;
    ragInstances.length = 0;
  });

  it('runs plan and streams tool execution updates', async () => {
    analyzeTextMock.mockResolvedValueOnce({
      success: true,
      structuredResult: { needsClarification: false },
    });
    analyzeTextMock.mockResolvedValueOnce({
      success: true,
      structuredResult: {
        plan: ['Check runtime', 'Inspect repos'],
        tool_calls: [
          { tool: 'sandbox', args: { command: 'node -v' } },
          { tool: 'github_api', args: { subcommand: 'search_repos', query: 'workers', limit: 1 } },
        ],
      },
    });
    ragSearchMock.mockResolvedValue('Knowledge base response');

    const env = createEnv();
    const actor = new ChatSessionActor(new MockState() as any, env);
    const ws = new MockWebSocket();
    (actor as any).webSocket = ws;

    const response = await actor.handleUserQuery('session-123', 'How do I deploy to Workers?');

    const github = gitHubInstances.at(-1);
    const sandbox = sandboxInstances.at(-1);

    expect(ragSearchMock).toHaveBeenCalledWith('How do I deploy to Workers?');
    expect(sandbox.exec).toHaveBeenCalledWith('node -v');
    expect(github.searchRepositories).toHaveBeenCalledWith('workers', undefined, 1);
    const messageTypes = ws.messages.map((entry) => JSON.parse(entry as string).type);
    expect(messageTypes).toContain('plan_created');
    expect(messageTypes).toContain('tool_start');
    expect(messageTypes).toContain('tool_end');
    expect(messageTypes.at(-1)).toBe('final_response');
    expect(response).toMatchObject({
      sessionId: 'session-123',
      plan: {
        steps: ['Check runtime', 'Inspect repos'],
      },
    });
  });

  it('handles clarification loop before executing plan', async () => {
    analyzeTextMock.mockResolvedValueOnce({
      success: true,
      structuredResult: { needsClarification: true, clarifyingQuestion: 'Which framework?' },
    });

    const env = createEnv();
    const state = new MockState();
    const actor = new ChatSessionActor(state as any, env);
    const ws = new MockWebSocket();
    (actor as any).webSocket = ws;

    const clarification = await actor.handleUserQuery('session-123', 'Help me');
    expect(clarification).toMatchObject({
      clarification: { needed: true, question: 'Which framework?' },
    });

    analyzeTextMock.mockResolvedValueOnce({
      success: true,
      structuredResult: { needsClarification: false },
    });
    analyzeTextMock.mockResolvedValueOnce({
      success: true,
      structuredResult: {
        plan: ['Step'],
        tool_calls: [],
      },
    });
    ragSearchMock.mockResolvedValue('No curated knowledge matched the query.');

    const response = await actor.handleUserQuery('session-123', 'Workers with Remix');
    expect(response.clarification?.needed).toBe(false);
    expect(state.storage.map.size).toBe(0);
  });
});
