/**
 * @file src/index.ts
 * @description This is the main entry point for the Cloudflare AI Research Assistant Worker.
 * It sets up the Hono router, defines the API routes, and implements the OpenAPI schema generation.
 * This file adheres to the Unified Routing principle outlined in AGENTS.md.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { WorkerEnv } from './env';
import { ChatSessionActor } from './actors/ChatSessionActor';

// Define the bindings from the environment
export type Bindings = WorkerEnv;

const app = new OpenAPIHono<{ Bindings: Bindings }>();

// --- OpenAPI Schema Definition ---

const ChatRequestSchema = z.object({
  sessionId: z.string().optional().openapi({
    description: 'An optional session ID to maintain conversation context.',
    example: 'session-12345',
  }),
  query: z.string().openapi({
    description: 'The question or prompt for the AI research assistant.',
    example: 'How do I set up a Next.js project on Cloudflare Pages?',
  }),
});

const ChatResponseSchema = z.object({
  sessionId: z.string().openapi({
    description: 'The session ID for the conversation.',
    example: 'session-12345',
  }),
  response: z.string().openapi({
    description: 'The AI assistant\'s response.',
    example: 'To set up a Next.js project on Cloudflare Pages, you need to...',
  }),
  // This will be expanded later to include citations, verified code, etc.
});

const route = createRoute({
  method: 'post',
  path: '/api/chat',
  request: {
    body: {
      content: {
        'application/json': {
          schema: ChatRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ChatResponseSchema,
        },
      },
      description: 'The response from the AI research assistant.',
    },
  },
});

// --- API Route Implementation ---

app.openapi(route, async (c) => {
  const { sessionId: requestedSessionId, query } = c.req.valid('json');
  const sessionId = requestedSessionId || crypto.randomUUID();

  // Here is the unified routing point.
  // We will get the actor and pass the request to a core handler.
  const actorId = c.env.CHAT_SESSION_ACTOR.idFromName(sessionId);
  const actor = c.env.CHAT_SESSION_ACTOR.get(actorId);

  // For now, we\'ll just send a simple request. This will be expanded.
  const response = await actor.fetch(c.req.raw);
  const result = (await response.json()) as z.infer<typeof ChatResponseSchema>;

  return c.json(result);
});


// --- OpenAPI Documentation Route ---

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Cloudflare AI Research Assistant API',
    version: 'v1.0.0',
    description: 'An API for interacting with an AI agent specialized in Cloudflare development.',
  },
});

// --- Health & Error Handling ---

app.get('/healthz', (c) => c.json({ status: 'ok' }));
app.notFound((c) => c.json({ error: 'Not Found' }, 404));
app.onError((error, c) => {
  console.error('Unhandled worker error', error);
  return c.json({ error: 'Internal Server Error' }, 500);
});

export default app;
export { ChatSessionActor };