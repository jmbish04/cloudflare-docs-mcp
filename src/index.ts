/**
 * @file src/index.ts
 * @description
 *   This is the main entry point for the Cloudflare Docs AI/MCP Worker.
 *
 *   It exposes a unified API for AI-driven research, code analysis, and
 *   knowledge curation, leveraging Cloudflare's ecosystem of Workers AI,
 *   Durable Objects, D1, Vectorize, and Queues.
 *
 *   The worker is architected around a set of stateful actors (Durable Objects)
 *   that manage long-running, complex tasks, ensuring resilience and
 *   scalability.
 *
 * @see
 *   - AGENTS.md: For an overview of the agentic architecture.
 *   - PRODUCT_VISION.md: For the high-level product goals.
 *   - GEMINI.md: For development context and conventions.
 *   - wrangler.toml: For configuration and bindings.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { WorkerEnv, Bindings } from './env';
import { ChatSessionActor } from './actors/ChatSessionActor';
import { CodeIngestionActor } from './actors/CodeIngestionActor';
import { FeasibilityAgentActor } from './actors/FeasibilityAgentActor';
import { runHealthCheck } from './health';
import { authMiddleware } from './auth';
import { DataAccessLayer, type FeasibilityJobStatus } from './data/dal';

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
  const dal = new DataAccessLayer(c.env.DB);
  const job = await dal.getFeasibilityJob(c.req.param('id'));
  return job ? c.json(job) : c.json({ error: 'Job not found' }, 404);
});

const jobsRoute = createRoute({ method: 'get', path: '/api/jobs', responses: { 200: { content: { 'application/json': { schema: JobListSchema }}}}});
app.openapi(jobsRoute, async (c) => {
  const { status, sortBy, q } = c.req.query();
  const dal = new DataAccessLayer(c.env.DB);
  const allowedStatuses: FeasibilityJobStatus[] = ['QUEUED', 'IN_PROGRESS', 'COMPLETED', 'FAILED'];
  const statusFilter = allowedStatuses.includes(status as FeasibilityJobStatus)
    ? (status as FeasibilityJobStatus)
    : undefined;
  const jobs = await dal.listFeasibilityJobs({
    status: statusFilter,
    query: q,
    sortDirection: sortBy === 'asc' ? 'ASC' : 'DESC',
  });
  return c.json(
    jobs.map(({ id, uuid, status: jobStatus, request_prompt, created_at }) => ({
      id,
      uuid,
      status: jobStatus,
      request_prompt,
      created_at,
    }))
  );
});

const jobPacketRoute = createRoute({ method: 'get', path: '/api/jobs/:id/packet', responses: { 200: { content: { 'application/json': { schema: JobPacketSchema }}}}});
app.openapi(jobPacketRoute, async (c) => {
  const dal = new DataAccessLayer(c.env.DB);
  const job = await dal.getFeasibilityJob(c.req.param('id'));
  if (!job || job.status !== 'COMPLETED') {
    return c.json({ error: 'Job not found or not complete' }, 404);
  }
  const analysis = await dal.listRepositoryAnalysisForJob(job.id);
  return c.json({ job, analysis });
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
    const dal = new DataAccessLayer(c.env.DB);
    await dal.setCuratedKnowledgeHighlight(id, highlighted, highlighted ? new Date().toISOString() : null);
    return c.json({ status: 'ok' });
  }
  return c.json({ error: 'Source not supported' }, 400);
});

app.get('/api/library/d1', async (c) => {
  const dal = new DataAccessLayer(c.env.DB);
  const entries = await dal.listActiveCuratedKnowledgeSummaries();
  return c.json(entries);
});

app.get('/api/library/kv', async (c) => {
  const list = await (c.env as any).AGENT_CACHE.list();
  return c.json(list.keys);
});

app.post('/api/health/run', authMiddleware, async (c) => c.json(await runHealthCheck(c.env)));
app.get('/api/health/status', async (c) => {
    const dal = new DataAccessLayer(c.env.DB);
    const latest = await dal.getLatestHealthCheck();
    return latest ? c.json(latest) : c.json({ message: 'No health checks run yet' }, 404);
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
