/**
 * @file src/index.ts
 * @description Main worker entry point, router, and API definitions.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { WorkerEnv, Bindings } from './env';
import { ChatSessionActor } from './actors/ChatSessionActor';
import { CodeIngestionActor } from './actors/CodeIngestionActor';
import { FeasibilityAgentActor } from './actors/FeasibilityAgentActor';
import { runHealthCheck } from './health';
import { authMiddleware } from './auth';

const app = new OpenAPIHono<{ Bindings: Bindings }>();

// --- OpenAPI Schema Definitions ---

const ChatRequestSchema = z.object({ /* ... */ });
const ChatResponseSchema = z.object({ /* ... */ });
const IngestionRequestSchema = z.object({ /* ... */ });
const IngestionResponseSchema = z.object({ /* ... */ });
const FeasibilityRequestSchema = z.object({ /* ... */ });
const FeasibilityResponseSchema = z.object({ /* ... */ });
const JobStatusSchema = z.object({ /* ... */ });
const JobListSchema = z.array(JobStatusSchema.pick({ id: true, uuid: true, status: true, request_prompt: true, created_at: true }));
const JobPacketSchema = z.object({ /* ... */ });

// --- API Route Definitions & Implementations ---

const chatRoute = createRoute({ method: 'post', path: '/api/chat', request: { body: { content: { 'application/json': { schema: ChatRequestSchema }}}}, responses: { 200: { content: { 'application/json': { schema: ChatResponseSchema }}}}});
app.openapi(chatRoute, async (c) => c.json(await handleChatRequest(c.env, c.req.valid('json').query, c.req.valid('json').sessionId)), authMiddleware);

const mcpRoute = createRoute({ method: 'post', path: '/mcp', request: { body: { content: { 'application/json': { schema: ChatRequestSchema }}}}, responses: { 200: { content: { 'application/json': { schema: ChatResponseSchema }}}}});
app.openapi(mcpRoute, async (c) => c.json(await handleChatRequest(c.env, c.req.valid('json').query, c.req.valid('json').sessionId)), authMiddleware);

const feasibilityRoute = createRoute({ method: 'post', path: '/api/feasibility', request: { body: { content: { 'application/json': { schema: FeasibilityRequestSchema }}}}, responses: { 202: { content: { 'application/json': { schema: FeasibilityResponseSchema }}}}});
app.openapi(feasibilityRoute, async (c) => {
  const actor = c.env.FEASIBILITY_AGENT_ACTOR.get(c.env.FEASIBILITY_AGENT_ACTOR.idFromName('singleton'));
  const res = await actor.fetch('https://actor.local', { method: 'POST', body: JSON.stringify(c.req.valid('json')) });
  return c.json(await res.json(), 202);
}, authMiddleware);

const jobStatusRoute = createRoute({ method: 'get', path: '/api/feasibility/status/:id', responses: { 200: { content: { 'application/json': { schema: JobStatusSchema }}}}});
app.openapi(jobStatusRoute, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM feasibility_jobs WHERE id = ?1 OR uuid = ?1').bind(c.req.param('id')).all();
  return results.length ? c.json(results[0]) : c.json({ error: 'Job not found' }, 404);
});

const jobsRoute = createRoute({ method: 'get', path: '/api/jobs', responses: { 200: { content: { 'application/json': { schema: JobListSchema }}}}});
app.openapi(jobsRoute, async (c) => {
  const { status, sortBy, q } = c.req.query();
  let query = 'SELECT id, uuid, status, request_prompt, created_at FROM feasibility_jobs';
  const params: any[] = [];
  const conditions: string[] = [];
  if (q) { conditions.push('request_prompt LIKE ?'); params.push(`%${q}%`); }
  if (status) { conditions.push('status = ?'); params.push(status); }
  if (conditions.length > 0) { query += ' WHERE ' + conditions.join(' AND '); }
  query += ` ORDER BY created_at ${sortBy === 'asc' ? 'ASC' : 'DESC'}`;
  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return c.json(results);
});

const jobPacketRoute = createRoute({ method: 'get', path: '/api/jobs/:id/packet', responses: { 200: { content: { 'application/json': { schema: JobPacketSchema }}}}});
app.openapi(jobPacketRoute, async (c) => {
  const jobResults = await c.env.DB.prepare('SELECT * FROM feasibility_jobs WHERE (id = ?1 OR uuid = ?1) AND status = \'COMPLETED\'').bind(c.req.param('id')).all();
  if (jobResults.results.length === 0) return c.json({ error: 'Job not found or not complete' }, 404);
  const job = jobResults.results[0];
  const analysisResults = await c.env.DB.prepare('SELECT * FROM repository_analysis WHERE job_id = ?').bind(job.id).all();
  return c.json({ job, analysis: analysisResults.results });
}, authMiddleware);

const ingestRoute = createRoute({ method: 'post', path: '/api/ingest', request: { body: { content: { 'application/json': { schema: IngestionRequestSchema }}}}, responses: { 202: { content: { 'application/json': { schema: IngestionResponseSchema }}}}});
app.openapi(ingestRoute, async (c) => {
    const actor = c.env.CODE_INGESTION_ACTOR.get(c.env.CODE_INGESTION_ACTOR.idFromName('singleton'));
    const res = await actor.fetch('https://actor.local', { method: 'POST', body: JSON.stringify(c.req.valid('json')) });
    return c.json(await res.json(), 202);
}, authMiddleware);

app.post('/api/library/highlight', authMiddleware, async (c) => {
  const { source, id, highlighted } = await c.req.json();
  if (source === 'd1') {
    await c.env.DB.prepare('UPDATE curated_knowledge SET is_highlighted = ?, time_highlighted = ? WHERE id = ?').bind(highlighted, highlighted ? new Date().toISOString() : null, id).run();
    return c.json({ status: 'ok' });
  }
  return c.json({ error: 'Source not supported' }, 400);
});

app.get('/api/library/d1', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, title, tags, is_highlighted FROM curated_knowledge WHERE is_active = TRUE').all();
  return c.json(results);
});

app.get('/api/library/kv', async (c) => {
  const list = await (c.env as any).AGENT_CACHE.list();
  return c.json(list.keys);
});

app.post('/api/health/run', authMiddleware, async (c) => c.json(await runHealthCheck(c.env)));
app.get('/api/health/status', async (c) => {
    const { results } = await c.env.DB.prepare('SELECT * FROM health_checks ORDER BY timestamp DESC LIMIT 1').all();
    return results.length ? c.json(results[0]) : c.json({ message: 'No health checks run yet' }, 404);
});
app.get('/healthz', (c) => c.json({ status: 'ok' }));

app.doc('/openapi.json', { openapi: '3.1.0', info: { title: 'Cloudflare AI Research Assistant API', version: 'v1.0.0' }});

async function handleChatRequest(env: Bindings, query: string, sessionId?: string) {
  sessionId = sessionId || crypto.randomUUID();
  const actor = env.CHAT_SESSION_ACTOR.get(env.CHAT_SESSION_ACTOR.idFromName(sessionId));
  const res = await actor.fetch('https://actor.local', { method: 'POST', body: JSON.stringify({ query, sessionId }) });
  return await res.json();
}

export default {
  fetch: app.fetch,
  scheduled: (event: ScheduledEvent, env: WorkerEnv, ctx: ExecutionContext) => ctx.waitUntil(runHealthCheck(env)),
  queue: (batch: MessageBatch, env: WorkerEnv, ctx: ExecutionContext) => { /* ... */ },
};

export { ChatSessionActor, CodeIngestionActor, FeasibilityAgentActor };
