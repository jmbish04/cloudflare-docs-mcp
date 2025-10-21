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
import { VectorizeService } from './data/vectorize_service';

const app = new OpenAPIHono<{ Bindings: Bindings }>();

// --- OpenAPI Schema Definitions ---

const ToolCallSchema = z
  .object({
    tool: z
      .string()
      .openapi({
        description: 'The registered tool name that the agent plans to invoke.',
        example: 'github_api',
      }),
    args: z
      .record(z.any())
      .optional()
      .openapi({
        description: 'Arguments that are passed to the selected tool.',
        example: { subcommand: 'search_repos', query: 'cloudflare workers hono example' },
      }),
  })
  .openapi({ description: 'A single tool invocation planned by the agent.' });

const ToolResultSchema = z
  .object({
    tool: z
      .string()
      .openapi({
        description: 'Name of the tool that was executed.',
        example: 'sandbox',
      }),
    result: z
      .any()
      .openapi({
        description: 'Raw result returned by the tool execution.',
        example: { stdout: 'total 2\nREADME.md', code: 0 },
      }),
  })
  .openapi({ description: 'An executed tool call and its output.' });

const ClarificationSchema = z
  .object({
    needed: z
      .boolean()
      .openapi({
        description: 'Indicates whether the agent requires additional information from the user.',
        example: true,
      }),
    question: z
      .string()
      .optional()
      .openapi({
        description: 'Follow-up question asked by the agent when clarification is required.',
        example: 'Which Cloudflare product are you targeting for the deployment?',
      }),
  })
  .openapi({ description: 'Clarification metadata when the agent needs more context.' });

const PlanSchema = z
  .object({
    steps: z
      .array(
        z.string().openapi({ description: 'A single step in the research plan.', example: 'Review recent Cloudflare Workers announcements.' }),
      )
      .openapi({
        description: 'High-level steps that the agent will follow to answer the query.',
        example: ['Check curated knowledge base for relevant guidance.', 'Search GitHub for sample Worker projects.'],
      }),
    toolCalls: z
      .array(ToolCallSchema)
      .openapi({ description: 'The ordered list of tool calls the agent intends to execute.' }),
  })
  .openapi({ description: 'Detailed plan produced by the agent prior to tool execution.' });

const ChatRequestSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .openapi({
        description: 'The natural language request sent to the research agent.',
        example: 'How do I deploy a Hono app to Cloudflare Workers?',
      }),
    sessionId: z
      .string()
      .uuid()
      .optional()
      .openapi({
        description: 'Existing session identifier to continue a prior conversation.',
        example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
      }),
  })
  .openapi({ description: 'Payload for initiating or continuing a chat session.' });

const ChatResponseSchema = z
  .object({
    sessionId: z
      .string()
      .uuid()
      .openapi({
        description: 'Identifier associated with the agent session handling the request.',
        example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
      }),
    response: z
      .string()
      .openapi({
        description: 'Final natural language answer returned by the agent.',
        example: 'Deploy the Hono app by running `npx wrangler deploy` after configuring your `wrangler.toml`.',
      }),
    plan: PlanSchema.optional(),
    tool_results: z
      .array(ToolResultSchema)
      .optional()
      .openapi({
        description: 'Outputs gathered from each tool execution performed by the agent.',
      }),
    clarification: ClarificationSchema.optional(),
    error: z
      .string()
      .optional()
      .openapi({
        description: 'Error message when the agent cannot complete the request.',
        example: 'An unexpected error occurred while processing the query.',
      }),
  })
  .openapi({ description: 'Structured response returned by the chat endpoint.' });

const IngestionRequestSchema = z
  .object({
    url: z
      .string()
      .url()
      .optional()
      .openapi({
        description: 'Remote URL to crawl and ingest into the knowledge base.',
        example: 'https://github.com/cloudflare/templates/blob/main/worker/src/index.ts',
      }),
    content: z
      .string()
      .optional()
      .openapi({
        description: 'Raw source content to ingest when a URL is not available.',
        example: 'export default { fetch() { return new Response("Hello Workers!"); } };',
      }),
    metadata: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
      .optional()
      .openapi({
        description: 'Additional metadata to attach to the ingested document.',
        example: { language: 'TypeScript', framework: 'Hono' },
      }),
  })
  .refine((data) => Boolean(data.url || data.content), {
    message: 'Either `url` or `content` must be provided.',
    path: ['url'],
  })
  .openapi({ description: 'Request payload for submitting a document or repository for ingestion.' });

const IngestionResponseSchema = z
  .object({
    documentId: z
      .string()
      .uuid()
      .openapi({
        description: 'Tracking identifier for the ingestion request.',
        example: '61a94f6e-6d77-4e58-9151-04a6cc0fc4ad',
      }),
    status: z
      .string()
      .openapi({
        description: 'Current status of the ingestion request.',
        example: 'queued',
      }),
    message: z
      .string()
      .optional()
      .openapi({
        description: 'Optional human-readable status message.',
        example: 'Code ingestion request received and queued.',
      }),
  })
  .openapi({ description: 'Acknowledgement returned after enqueuing an ingestion request.' });

const FeasibilityRequestSchema = z
  .object({
    prompt: z
      .string()
      .min(1)
      .openapi({
        description: 'Detailed description of the initiative or project to research.',
        example: 'Assess whether we can migrate our Express.js API to Cloudflare Workers.',
      }),
  })
  .openapi({ description: 'Payload for initiating a long-running feasibility research job.' });

const FeasibilityResponseSchema = z
  .object({
    jobId: z
      .string()
      .uuid()
      .openapi({
        description: 'Stable identifier for tracking the feasibility research job.',
        example: 'cfdc2172-8c15-4ff5-9e1f-9e5b309d75ba',
      }),
    status: z
      .enum(['QUEUED', 'IN_PROGRESS', 'COMPLETED', 'FAILED'])
      .openapi({
        description: 'Current status of the feasibility job. New requests return QUEUED.',
        example: 'QUEUED',
      }),
    message: z
      .string()
      .optional()
      .openapi({
        description: 'Optional descriptive message about the job state.',
        example: 'Feasibility research job has been queued.',
      }),
  })
  .openapi({ description: 'Acknowledgement returned after scheduling a feasibility study.' });

const JobStatusSchema = z
  .object({
    id: z
      .number()
      .int()
      .openapi({ description: 'Auto-incrementing database identifier.', example: 42 }),
    uuid: z
      .string()
      .uuid()
      .openapi({ description: 'Stable public identifier for the job.', example: 'cfdc2172-8c15-4ff5-9e1f-9e5b309d75ba' }),
    status: z
      .enum(['QUEUED', 'IN_PROGRESS', 'COMPLETED', 'FAILED'])
      .openapi({ description: 'Current processing state of the job.', example: 'IN_PROGRESS' }),
    request_prompt: z
      .string()
      .openapi({ description: 'Original prompt that initiated the feasibility study.', example: 'Assess Cloudflare Worker migration plan.' }),
    final_report: z
      .string()
      .nullable()
      .openapi({ description: 'Final synthesized report once the job completes.', example: 'Migration is feasible with minor refactors.' }),
    created_at: z
      .string()
      .openapi({ description: 'ISO timestamp when the job was created.', example: '2024-03-01T12:00:00Z' }),
    updated_at: z
      .string()
      .openapi({ description: 'ISO timestamp when the job was last updated.', example: '2024-03-01T12:05:00Z' }),
    is_active: z
      .boolean()
      .openapi({ description: 'Flag indicating whether the job is still active.', example: true }),
    time_inactive: z
      .string()
      .nullable()
      .openapi({ description: 'Timestamp when the job was deactivated, if applicable.', example: null }),
    is_highlighted: z
      .boolean()
      .openapi({ description: 'Whether the job has been highlighted for follow-up.', example: false }),
    time_highlighted: z
      .string()
      .nullable()
      .openapi({ description: 'Timestamp when the job was highlighted.', example: null }),
    information_packet_id: z
      .number()
      .int()
      .nullable()
      .openapi({ description: 'Identifier of the synthesized information packet, if available.', example: 7 }),
  })
  .openapi({ description: 'Complete record for a feasibility research job.' });

const JobListSchema = z
  .array(
    JobStatusSchema.pick({ id: true, uuid: true, status: true, request_prompt: true, created_at: true }).openapi({
      description: 'Summary view of a feasibility job.',
    }),
  )
  .openapi({ description: 'Collection of feasibility jobs matching the provided filters.' });

const RepositoryAnalysisSchema = z
  .object({
    id: z
      .number()
      .int()
      .openapi({ description: 'Identifier for the repository analysis record.', example: 12 }),
    job_id: z
      .number()
      .int()
      .openapi({ description: 'Identifier of the associated feasibility job.', example: 42 }),
    repo_url: z
      .string()
      .url()
      .openapi({ description: 'Repository that was reviewed during the feasibility study.', example: 'https://github.com/cloudflare/workers-sdk' }),
    analysis_summary: z
      .string()
      .openapi({ description: 'Short summary of the findings for this repository.', example: 'Repository demonstrates Workers Sites integration.' }),
    frameworks_detected: z
      .string()
      .nullable()
      .openapi({ description: 'Comma-separated list of detected frameworks.', example: 'Hono,React' }),
    is_on_workers: z
      .boolean()
      .nullable()
      .openapi({ description: 'Indicates whether the repository currently deploys to Cloudflare Workers.', example: true }),
    raw_analysis_data: z
      .string()
      .nullable()
      .openapi({ description: 'Serialized raw output of the repository analysis.', example: '{"stars":1200}' }),
    created_at: z
      .string()
      .openapi({ description: 'Timestamp when the repository analysis record was created.', example: '2024-03-01T12:10:00Z' }),
  })
  .openapi({ description: 'Repository-level findings linked to a feasibility job.' });

const JobPacketSchema = z
  .object({
    job: JobStatusSchema,
    analysis: z
      .array(RepositoryAnalysisSchema)
      .openapi({ description: 'Repository analyses that support the final feasibility report.' }),
  })
  .openapi({ description: 'Detailed information packet for a completed feasibility job.' });

// --- API Route Definitions & Implementations ---

const chatRoute = createRoute({
  method: 'post',
  path: '/api/chat',
  summary: 'Start or continue a chat session',
  description:
    'Routes a natural language question to the research agent. Returns the synthesized answer, any tool outputs, and clarification metadata.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: ChatRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Successful agent response including the synthesized answer and optional plan metadata.",
      content: {
        'application/json': {
          schema: ChatResponseSchema,
        },
      },
    },
    400: {
      description: 'Invalid chat payload.',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }).openapi({ description: 'Error response structure.' }),
        },
      },
    },
  },
});
app.openapi(
  chatRoute,
  async (c) => {
    const body = c.req.valid('json');
    return c.json(await handleChatRequest(c.env, body.query, body.sessionId));
  },
  authMiddleware,
);

app.get('/api/chat/ws', authMiddleware, async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }

  const sessionId = crypto.randomUUID();
  const actor = c.env.CHAT_SESSION_ACTOR.get(c.env.CHAT_SESSION_ACTOR.idFromName(sessionId));
  const response = await actor.fetch('https://actor.local/ws', {
    headers: { Upgrade: 'websocket' },
  });

  if (response.status !== 101 || !response.webSocket) {
    return new Response('WebSocket upgrade failed', { status: 500 });
  }

  response.headers.set('x-session-id', sessionId);
  return response;
});

const mcpRoute = createRoute({
  method: 'post',
  path: '/mcp',
  summary: 'MCP-compatible chat endpoint',
  description: 'Adapter endpoint for Model Context Protocol agents. Accepts the same payload as /api/chat.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: ChatRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Structured agent response compatible with MCP integrations.',
      content: {
        'application/json': {
          schema: ChatResponseSchema,
        },
      },
    },
  },
});
app.openapi(
  mcpRoute,
  async (c) => {
    const body = c.req.valid('json');
    return c.json(await handleChatRequest(c.env, body.query, body.sessionId));
  },
  authMiddleware,
);

const feasibilityRoute = createRoute({
  method: 'post',
  path: '/api/feasibility',
  summary: 'Queue a feasibility research job',
  description:
    'Creates a long-running feasibility study that analyses repositories and curated knowledge to determine migration readiness.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: FeasibilityRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    202: {
      description: 'Acknowledgement that the feasibility job was accepted for processing.',
      content: {
        'application/json': {
          schema: FeasibilityResponseSchema,
        },
      },
    },
    400: {
      description: 'Invalid feasibility payload.',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
});
app.openapi(
  feasibilityRoute,
  async (c) => {
    const body = c.req.valid('json');
    const actor = c.env.FEASIBILITY_AGENT_ACTOR.get(c.env.FEASIBILITY_AGENT_ACTOR.idFromName('singleton'));
    const res = await actor.fetch('https://actor.local', { method: 'POST', body: JSON.stringify({ prompt: body.prompt }) });
    const data = await res.json<{ message?: string; jobId?: number; uuid?: string }>();
    const jobId = data.uuid ?? (data.jobId ? String(data.jobId) : crypto.randomUUID());
    return c.json(
      {
        jobId,
        status: 'QUEUED',
        message: data.message ?? 'Feasibility research job has been queued.',
      },
      202,
    );
  },
  authMiddleware,
);

const jobStatusRoute = createRoute({
  method: 'get',
  path: '/api/feasibility/status/:id',
  summary: 'Get feasibility job status',
  description: 'Retrieves the latest status and metadata for a specific feasibility job by numeric ID or UUID.',
  request: {
    params: z.object({
      id: z
        .string()
        .openapi({ description: 'Numeric ID or UUID assigned to the feasibility job.', example: 'cfdc2172-8c15-4ff5-9e1f-9e5b309d75ba' }),
    }),
  },
  responses: {
    200: {
      description: 'Current feasibility job state.',
      content: {
        'application/json': {
          schema: JobStatusSchema,
        },
      },
    },
    404: {
      description: 'Job could not be found.',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
});
app.openapi(jobStatusRoute, async (c) => {
  const dal = new DataAccessLayer(c.env.DB);
  const job = await dal.getFeasibilityJob(c.req.param('id'));
  return job ? c.json(job) : c.json({ error: 'Job not found' }, 404);
});

const jobsRoute = createRoute({
  method: 'get',
  path: '/api/jobs',
  summary: 'List feasibility jobs',
  description: 'Returns a filtered list of feasibility jobs. Supports status filtering, free-text search, and sorting.',
  request: {
    query: z.object({
      status: z
        .enum(['QUEUED', 'IN_PROGRESS', 'COMPLETED', 'FAILED'])
        .optional()
        .openapi({ description: 'Optional status filter.', example: 'COMPLETED' }),
      sortBy: z
        .enum(['asc', 'desc'])
        .optional()
        .openapi({ description: 'Sort direction for creation time. Defaults to desc.', example: 'asc' }),
      q: z
        .string()
        .optional()
        .openapi({ description: 'Full-text search on the request prompt.', example: 'migrate to workers' }),
    }),
  },
  responses: {
    200: {
      description: 'List of feasibility jobs that match the provided filters.',
      content: {
        'application/json': {
          schema: JobListSchema,
        },
      },
    },
  },
});
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
    })),
  );
});

const jobPacketRoute = createRoute({
  method: 'get',
  path: '/api/jobs/:id/packet',
  summary: 'Retrieve job information packet',
  description: 'Returns the final feasibility job record along with supporting repository analyses once the job has completed.',
  request: {
    params: z.object({
      id: z
        .string()
        .openapi({ description: 'Numeric ID or UUID for the job.', example: '42' }),
    }),
  },
  responses: {
    200: {
      description: 'Information packet containing the job metadata and analysis details.',
      content: {
        'application/json': {
          schema: JobPacketSchema,
        },
      },
    },
    404: {
      description: 'Returned when the job is not complete or does not exist.',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
});
app.openapi(
  jobPacketRoute,
  async (c) => {
    const dal = new DataAccessLayer(c.env.DB);
    const job = await dal.getFeasibilityJob(c.req.param('id'));
    if (!job || job.status !== 'COMPLETED') {
      return c.json({ error: 'Job not found or not complete' }, 404);
    }
    const analysis = await dal.listRepositoryAnalysisForJob(job.id);
    return c.json({ job, analysis });
  },
  authMiddleware,
);

const ingestRoute = createRoute({
  method: 'post',
  path: '/api/ingest',
  summary: 'Submit content for ingestion',
  description: 'Queues code or documentation for vectorization and indexing into the agent knowledge base.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: IngestionRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    202: {
      description: 'The ingestion request has been queued.',
      content: {
        'application/json': {
          schema: IngestionResponseSchema,
        },
      },
    },
    400: {
      description: 'Invalid ingestion payload.',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
});
app.openapi(
  ingestRoute,
  async (c) => {
    const body = c.req.valid('json');
    const actor = c.env.CODE_INGESTION_ACTOR.get(c.env.CODE_INGESTION_ACTOR.idFromName('singleton'));
    const res = await actor.fetch(
      'https://actor.local',
      {
        method: 'POST',
        body: JSON.stringify({
          sourceUrl: body.url,
          rawCode: body.content,
          metadata: body.metadata,
        }),
      },
    );
    const data = await res.json<{ message?: string; ingestionId?: string }>();
    return c.json(
      {
        documentId: data.ingestionId ?? crypto.randomUUID(),
        status: 'queued',
        message: data.message ?? 'Ingestion request received.',
      },
      202,
    );
  },
  authMiddleware,
);

app.post('/api/library/highlight', authMiddleware, async (c) => {
  const { source, id, highlighted } = await c.req.json();
  if (source === 'd1') {
    const dal = new DataAccessLayer(c.env.DB);
    await dal.setCuratedKnowledgeHighlight(id, highlighted, highlighted ? new Date().toISOString() : null);
    return c.json({ status: 'ok' });
  }
  return c.json({ error: 'Source not supported' }, 400);
});

app.post('/api/curate', authMiddleware, async (c) => {
  try {
    const body = await c.req.json<Record<string, unknown>>();
    const textValue = body['text'];
    const contentValue = body['content'];
    const rawText =
      typeof textValue === 'string' && textValue.trim().length
        ? textValue
        : typeof contentValue === 'string'
          ? contentValue
          : '';
    if (!rawText.trim()) {
      return c.json({ error: 'Text content is required.' }, 400);
    }

    const titleValue = body['title'];
    const title = typeof titleValue === 'string' && titleValue.trim().length ? titleValue.trim() : 'Untitled Entry';
    const sourceUrlValue = body['sourceUrl'];
    const sourceUrl =
      typeof sourceUrlValue === 'string' && sourceUrlValue.trim().length ? sourceUrlValue.trim() : null;
    let tags: string | null = null;
    const tagsValue = body['tags'];
    if (Array.isArray(tagsValue)) {
      tags = tagsValue.map((tag: unknown) => (typeof tag === 'string' ? tag.trim() : '')).filter(Boolean).join(', ');
    } else if (typeof tagsValue === 'string' && tagsValue.trim().length) {
      tags = tagsValue.trim();
    }

    const dal = new DataAccessLayer(c.env.DB);
    const record = await dal.createCuratedKnowledge({
      title,
      content: rawText.trim(),
      source_url: sourceUrl,
      tags,
    });

    const vectorizeService = new VectorizeService(c.env.VECTORIZE_INDEX, c.env.AI, c.env.DEFAULT_MODEL_EMBEDDING);
    const metadataValue = body['metadata'];
    const extraMetadata: Record<string, VectorizeVectorMetadata> =
      metadataValue && typeof metadataValue === 'object' && metadataValue !== null && !Array.isArray(metadataValue)
        ? Object.fromEntries(
            Object.entries(metadataValue as Record<string, unknown>).filter(([, value]) => {
              if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                return true;
              }
              if (Array.isArray(value)) {
                return value.every((item) => typeof item === 'string');
              }
              return false;
            }),
          )
        : {};
    await vectorizeService.upsertDocument({
      id: String(record.id),
      text: record.content,
      metadata: {
        title: record.title,
        source_url: record.source_url,
        tags: record.tags,
        created_at: record.created_at,
        updated_at: record.updated_at,
        ...extraMetadata,
      },
    });

    return c.json({ id: record.id, status: 'indexed' }, 201);
  } catch (error) {
    console.error('Failed to curate knowledge:', error);
    return c.json({ error: 'Failed to curate knowledge.' }, 500);
  }
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
