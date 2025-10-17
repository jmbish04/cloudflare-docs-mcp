import { SearchDocsRequest, SearchDocsResponse } from './schemas';

const ALLOWED_TOOLS = ['search_docs', 'code_consultation'] as const;
export type AllowedTool = (typeof ALLOWED_TOOLS)[number];

export interface MCPAdapterEnv {
  DOCS_MCP_BASE_URL?: string;
  DOCS_MCP_AUTH_TOKEN?: string;
}

export interface MCPProxyClient {
  fetch: typeof fetch;
}

export class MCPAdapter {
  constructor(private readonly client: MCPProxyClient = { fetch }) {}

  listTools() {
    return {
      tools: [
        {
          name: 'search_docs' as const,
          description: 'Search curated Cloudflare documentation for relevant guidance.',
          input_schema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              topK: { type: 'integer', minimum: 1, maximum: 10 },
            },
            required: ['query'],
          },
        },
        {
          name: 'code_consultation' as const,
          description: 'Perform an AI-assisted code review and patch recommendation using Cloudflare best practices.',
          input_schema: {
            type: 'object',
            properties: {
              consult_query: { type: 'string' },
              code_string: { type: 'string' },
            },
            required: ['consult_query', 'code_string'],
          },
        },
      ],
    } as const;
  }

  async proxySearchDocs(env: MCPAdapterEnv, payload: SearchDocsRequest): Promise<SearchDocsResponse> {
    if (!env.DOCS_MCP_BASE_URL) {
      throw new Error('DOCS_MCP_BASE_URL is not configured.');
    }

    const url = new URL('/tools/call', env.DOCS_MCP_BASE_URL);
    const response = await this.client.fetch(url.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(env.DOCS_MCP_AUTH_TOKEN ? { authorization: `Bearer ${env.DOCS_MCP_AUTH_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        name: 'search_docs',
        arguments: payload,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Could not read error body.');
      throw new Error(`Docs MCP proxy failed with status ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as { response: SearchDocsResponse } | SearchDocsResponse;
    const result = 'response' in data ? data.response : data;
    return result;
  }

  assertAllowedTool(name: string): asserts name is AllowedTool {
    if (!ALLOWED_TOOLS.includes(name as AllowedTool)) {
      throw new Error(`Tool '${name}' is not permitted.`);
    }
  }
}
