import { Hono } from 'hono';
import type { Context } from 'hono';
import { OpenAPIHono } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { configureOpenAPIRoute } from './openapi';
import { MCPAdapter, MCPAdapterEnv } from './mcpAdapter';
import { ConsultationAgent, AgentEnv } from './agent';
import {
  codeConsultationRoute,
  CodeConsultationRequestSchema,
  ErrorSchema,
  MCPToolCallRequestSchema,
  MCPToolCallResponseSchema,
  MCPToolListResponseSchema,
  searchDocsRoute,
  SearchDocsRequestSchema,
} from './schemas';

export type Bindings = AgentEnv & MCPAdapterEnv;

const app = new OpenAPIHono<{ Bindings: Bindings }>();
const router = new Hono<{ Bindings: Bindings }>();
const adapter = new MCPAdapter();

configureOpenAPIRoute(app);

app.openapi(searchDocsRoute, async (c) => {
  try {
    const payload = SearchDocsRequestSchema.parse(await c.req.json<unknown>());
    const result = await adapter.proxySearchDocs(c.env, payload);
    return c.json(result);
  } catch (error) {
    return sendError(c, error);
  }
});

app.openapi(codeConsultationRoute, async (c) => {
  try {
    const payload = CodeConsultationRequestSchema.parse(await c.req.json<unknown>());
    const agent = new ConsultationAgent(c.env);
    const response = await agent.runCodeConsultation(payload, (input) =>
      adapter.proxySearchDocs(c.env, input)
    );
    return c.json(response);
  } catch (error) {
    return sendError(c, error);
  }
});

router.get('/tools/list', (c) => {
  const tools = adapter.listTools();
  const parsed = MCPToolListResponseSchema.safeParse(tools);
  if (!parsed.success) {
    throw new HTTPException(500, { message: 'Tool registry is misconfigured.' });
  }
  return c.json(parsed.data);
});

router.post('/tools/call', async (c) => {
  const body = await c.req.json().catch(() => undefined);
  const parsed = MCPToolCallRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(ErrorSchema.parse({ error: 'Invalid tool invocation payload.' }), 400);
  }

  const { name, arguments: args } = parsed.data;
  try {
    if (name === 'search_docs') {
      const payload = SearchDocsRequestSchema.parse(args);
      const response = await adapter.proxySearchDocs(c.env, payload);
      return c.json(MCPToolCallResponseSchema.parse({ name, response }));
    }

    if (name === 'code_consultation') {
      const payload = CodeConsultationRequestSchema.parse(args);
      const agent = new ConsultationAgent(c.env);
      const response = await agent.runCodeConsultation(payload, (input) =>
        adapter.proxySearchDocs(c.env, input)
      );
      return c.json(MCPToolCallResponseSchema.parse({ name, response }));
    }

    throw new HTTPException(404, { message: `Tool ${name} not found.` });
  } catch (error) {
    return sendError(c, error);
  }
});

app.route('/', router);

app.notFound((c) => c.json(ErrorSchema.parse({ error: 'Not Found' }), 404));

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json(ErrorSchema.parse({ error: error.message }), error.status);
  }
  console.error('Unhandled error', error);
  return c.json(ErrorSchema.parse({ error: 'Internal Server Error' }), 500);
});

function sendError(c: Context<{ Bindings: Bindings }>, error: unknown) {
  if (error instanceof HTTPException) {
    throw error;
  }

  const message = error instanceof Error ? error.message : 'Unexpected error.';
  return c.json(ErrorSchema.parse({ error: message }), 500);
}

export default app;
