# Orchestrator Worker – TODO

## MCP + Tools
- Wire MCP tools from `tools.config.json` (Docs, Observability, Context7, GitHub).
- Orchestrate fan-out runs with timeouts, retries, and per-tool error envelopes.
- Log all tool transactions to D1 (`transactions`: request, response, status, latency).

## D1 Schema + Curation
- Finalize D1 tables: `transactions`, `curated_knowledge`, `repository_analysis`, `feasibility_jobs` (+ indexes).
- Ensure migrations are idempotent and add seed rows for curated best practices.
- Add typed DAL/query helpers with pagination and filtering.

## Unified Routing
- Replace placeholder zod schemas in `src/index.ts` (`/mcp`, `/api/chat`, `/api/ingest`, `/api/feasibility`).
- Implement WebSocket support for `/api/chat` with session pickup, heartbeats, and backpressure.

## Agent Logic
- Add clarifying-question phase before tool selection.
- Implement synthesis to a consistent “information package” format with citations and action items.
- Add Vectorize RAG + reranker; include chunk/source metadata in responses.

## Sandboxed Verification
- Implement Workers for Platforms sandbox execution and file staging APIs.
- Build error reproduction harness; capture logs/artifacts and persist pointers to D1.

## Observability + Feedback
- Complete `runHealthCheck` coverage (tools, D1, Vectorize, KV, Queues).
- Add `/api/feedback` endpoint and D1 schema to store ratings/notes; background curation task.

## Security + Auth
- Finish auth middleware (API keys/Access rules per route) and rate limiting.
- Verify Wrangler secrets and document setup.

## OpenAPI + Docs
- Generate complete OpenAPI 3.1 at `/openapi.json` (including WS flow docs).
- Update `README.md` (setup, deploy, tool config, examples) and `AGENTS.md` (conventions/tests).

## Testing
- Unit tests for tool adapters, DAL, and auth.
- E2E path: chat → tool runs → synthesis → D1 transactions.
- Contract tests for WebSocket sessions.

## PR Readiness
- Ensure `tsc` clean; run lint/format.
- Push branch and open PR with a detailed checklist summarizing the above.

