import { describe, expect, it, vi } from 'vitest';
import { MCPAdapter } from '../mcpAdapter';

const baseEnv = {
  DOCS_MCP_BASE_URL: 'https://example.com',
  DOCS_MCP_AUTH_TOKEN: 'token',
};

describe('MCPAdapter', () => {
  it('lists available tools with required metadata', () => {
    const adapter = new MCPAdapter();
    const { tools } = adapter.listTools();

    expect(tools).toHaveLength(2);
    expect(tools.map((tool) => tool.name)).toEqual(['search_docs', 'code_consultation']);
    expect(tools[0].input_schema).toMatchObject({ type: 'object' });
  });

  it('throws when proxySearchDocs is missing configuration', async () => {
    const adapter = new MCPAdapter();

    await expect(
      adapter.proxySearchDocs({}, { query: 'cache rules', topK: 3 })
    ).rejects.toThrow('DOCS_MCP_BASE_URL is not configured.');
  });

  it('delegates search requests to the MCP proxy endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        response: { results: [] },
      }),
    });

    const adapter = new MCPAdapter({ fetch: fetch as unknown as typeof globalThis.fetch });
    const payload = { query: 'workers kv', topK: 2 };

    const response = await adapter.proxySearchDocs(baseEnv, payload);

    expect(fetch).toHaveBeenCalledWith('https://example.com/tools/call', {
      method: 'POST',
      headers: expect.objectContaining({
        'content-type': 'application/json',
        authorization: 'Bearer token',
      }),
      body: JSON.stringify({ name: 'search_docs', arguments: payload }),
    });
    expect(response).toEqual({ results: [] });
  });

  it('surface proxy errors with status code context', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service unavailable',
    });

    const adapter = new MCPAdapter({ fetch: fetch as unknown as typeof globalThis.fetch });

    await expect(
      adapter.proxySearchDocs(baseEnv, { query: 'durable objects', topK: 1 })
    ).rejects.toThrow('Docs MCP proxy failed with status 503: Service unavailable');
  });
});
