# Cloudflare Docs MCP

The Cloudflare Docs MCP worker is an agentic research surface that orchestrates tools,
vector search, and long-lived Durable Object sessions to answer developer questions about
Cloudflare. The worker exposes both REST and WebSocket interfaces so that first-party and
third-party clients can collaborate with the same agent runtime.

## Architecture Overview

- **ChatSessionActor** – stateful Durable Object that stores the conversation history,
  orchestrates clarification, planning, tool execution, and synthesis, and emits
  WebSocket updates.
- **FeasibilityAgentActor** – queues long-running feasibility research jobs and records
  progress in D1.
- **CodeIngestionActor** – accepts code or documentation for ingestion and dispatches it
  to a queue for asynchronous processing.
- **Data Layer** – D1 stores curated knowledge, feasibility job records, and analysis
  artefacts. Vectorize maintains the semantic index referenced during planning.
- **Queues & Sandbox** – Cloudflare Queues coordinate background processing, and the
  sandbox Durable Object executes code securely when tool plans request it.

An OpenAPI 3.1 specification is generated directly from `src/index.ts`. The same entry
point also registers a WebSocket upgrade handler at `/api/chat/ws` for interactive
sessions.

## API Overview

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/chat` | `POST` | Send a chat turn to the agent and receive the synthesized response plus optional plan metadata. |
| `/mcp` | `POST` | MCP-compatible alias for `/api/chat` used by other agents. |
| `/api/chat/ws` | `GET` | Upgrade to a WebSocket session with the chat agent. The response header `x-session-id` contains the session identifier. |
| `/api/feasibility` | `POST` | Queue a feasibility research job for asynchronous analysis. |
| `/api/feasibility/status/:id` | `GET` | Retrieve the latest status for a job by numeric ID or UUID. |
| `/api/jobs` | `GET` | List feasibility jobs with optional filtering and sorting. |
| `/api/jobs/:id/packet` | `GET` | Fetch the full information packet for a completed job, including repository analysis. |
| `/api/ingest` | `POST` | Submit a URL or raw content to be ingested into the knowledge base. |
| `/openapi.json` | `GET` | Download the generated OpenAPI schema. |
| `/healthz` | `GET` | Lightweight health probe for automated monitors. |

All authenticated routes require the `Authorization` header that the worker checks inside
`authMiddleware`.

### Chat Endpoint Example

```sh
curl -X POST https://<worker>/api/chat \
  -H "Authorization: Bearer <token>" \
  -H "content-type: application/json" \
  -d '{
        "query": "How do I deploy a Hono API to Cloudflare Workers?",
        "sessionId": "a1b2c3d4-e5f6-7890-1234-567890abcdef"
      }'
```

Successful responses follow the structure enforced by `ChatResponseSchema`:

```json
{
  "sessionId": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
  "response": "Deploy the Hono app by running `npx wrangler deploy` after configuring wrangler.toml.",
  "plan": {
    "steps": [
      "Check curated knowledge base for Hono guidance.",
      "Search GitHub for Workers examples."
    ],
    "toolCalls": [
      { "tool": "cloudflare_docs", "args": { "query": "Hono deployment" } }
    ]
  },
  "tool_results": [
    {
      "tool": "cloudflare_docs",
      "result": { "hits": 3 }
    }
  ],
  "clarification": { "needed": false }
}
```

If the agent needs more information, the response includes a clarification object:

```json
{
  "sessionId": "...",
  "response": "Could you clarify which Cloudflare product you plan to deploy to?",
  "clarification": {
    "needed": true,
    "question": "Which Cloudflare product are you targeting?"
  }
}
```

### WebSocket Sessions

To start a streaming session, issue a WebSocket upgrade request:

```sh
curl -i -N -H "Authorization: Bearer <token>" \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  https://<worker>/api/chat/ws
```

The handshake response includes `x-session-id`. Send JSON messages of the form
`{"query": "..."}` over the socket. The agent streams structured updates such as
`status`, `plan_created`, `tool_start`, `tool_end`, and `final_response` events until
the session completes.

### Feasibility Jobs

```sh
curl -X POST https://<worker>/api/feasibility \
  -H "Authorization: Bearer <token>" \
  -H "content-type: application/json" \
  -d '{ "prompt": "Assess migrating our Express API to Cloudflare Workers" }'
```

The worker responds with the UUID-backed job identifier:

```json
{
  "jobId": "cfdc2172-8c15-4ff5-9e1f-9e5b309d75ba",
  "status": "QUEUED",
  "message": "Feasibility research job has been queued."
}
```

Use `/api/feasibility/status/:id` to poll for updates, `/api/jobs` to explore job
history, and `/api/jobs/:id/packet` to download the final report and supporting
repository analysis once the job completes.

### Knowledge Ingestion

```sh
curl -X POST https://<worker>/api/ingest \
  -H "Authorization: Bearer <token>" \
  -H "content-type: application/json" \
  -d '{
        "url": "https://github.com/cloudflare/workers-sdk/blob/main/examples/hono-app.ts",
        "metadata": { "language": "TypeScript", "framework": "Hono" }
      }'
```

The request is queued for asynchronous processing and the response includes a tracking
identifier:

```json
{
  "documentId": "61a94f6e-6d77-4e58-9151-04a6cc0fc4ad",
  "status": "queued",
  "message": "Ingestion request received."
}
```

## Running Locally

```sh
npm install
npm run dev
```

`wrangler dev` provisions local Durable Objects, queues, and the sandbox binding so that
the agent workflow can be exercised end-to-end.

### Database Migrations

```sh
# Apply migrations using a local D1 instance
npm run migrate:local

# Apply migrations to the remote production database
npm run migrate:remote
```

### Tests & Linting

```sh
npm run check
npm test
```

## Environment & Bindings

| Binding | Description |
| --- | --- |
| `DB` | D1 database storing curated knowledge, feasibility jobs, and analysis artefacts. |
| `CHAT_SESSION_ACTOR` | Durable Object namespace hosting chat sessions. |
| `CODE_INGESTION_ACTOR` | Durable Object namespace handling ingestion requests. |
| `FEASIBILITY_AGENT_ACTOR` | Durable Object namespace coordinating feasibility jobs. |
| `SANDBOX` | Durable Object providing an isolated execution environment for tool runs. |
| `CODE_INGESTION_QUEUE` | Queue for asynchronous ingestion processing. |
| `FEASIBILITY_QUEUE` | Queue for feasibility job workers. |
| `AGENT_CACHE` | KV namespace used for transient caching and health checks. |
| `VECTORIZE_INDEX` | Vectorize index queried by the research agent. |
| `AI` | Workers AI binding powering clarification, planning, and synthesis. |
| `DEFAULT_MODEL_REASONING`, `DEFAULT_MODEL_STRUCTURED_RESPONSE`, `DEFAULT_MODEL_EMBEDDING` | Environment variables declaring the Workers AI models used across the workflow. |

Secrets such as `WORKER_API_KEY`, `GITHUB_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and
`CLOUDFLARE_API_TOKEN` are configured with `wrangler secret put`.

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| `401 Unauthorized` when calling REST endpoints | Ensure the `Authorization` header is present and matches the token validated by `authMiddleware`. |
| Chat response lacks plan or tool results | The agent omits plan metadata when clarification is required or when tool execution fails; check the `clarification` and `error` fields for context. |
| Feasibility job remains queued | Inspect the `FEASIBILITY_QUEUE` consumer and Worker logs to confirm the job was dispatched. |
| Ingestion response missing `documentId` | The fallback UUID generator executes when the ingestion actor does not return an ID; verify actor logs for upstream failures. |

The OpenAPI specification can be accessed at `/openapi.json` and imported into client
SDK generators or documentation tooling.
