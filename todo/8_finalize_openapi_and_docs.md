# Task 8: Finalize OpenAPI Spec and Documentation

## Objective
Ensure the project has a complete and accurate OpenAPI 3.1 specification, and that the user-facing documentation (`README.md`, `AGENTS.md`) is up-to-date and provides clear examples.

## Context
The project uses `@hono/zod-openapi` to generate an OpenAPI spec from the route definitions in `src/index.ts`. However, many of the schemas are placeholders (`z.object({ /* ... */ })`). The documentation also needs to be updated to reflect the final, agent-based architecture.

## Requirements

### 1. Finalize Zod Schemas
- Open `src/index.ts`.
- Go through each placeholder schema and define it fully.
- **`ChatRequestSchema`**: Should include `query` (string) and optional `sessionId` (string).
- **`ChatResponseSchema`**: Should be comprehensive, including `sessionId`, `response` (string), and potentially arrays for the `plan`, `tool_results`, and `clarification_question`.
- **`FeasibilityRequestSchema`**: Should include `prompt` (string).
- **`FeasibilityResponseSchema`**: Should include `jobId` (string) and `status` (string).
- **`JobStatusSchema`**: Should fully model the `feasibility_jobs` table from D1.
- **`IngestionRequestSchema`**: Should define the structure for submitting a URL or content for ingestion (e.g., `url`, `content`, `metadata`).
- **`IngestionResponseSchema`**: Should include a `documentId` or `status`.

### 2. Update OpenAPI Route Definitions
- Review each `createRoute` call in `src/index.ts`.
- Ensure that the `request` and `responses` sections correctly reference the finalized schemas.
- Add descriptions and examples to each route and parameter to make the generated OpenAPI documentation more useful.

### Example Schema and Route Update:

```typescript
// src/index.ts

// --- OpenAPI Schema Definitions ---
const ChatRequestSchema = z.object({
  query: z.string().openapi({
    description: 'The natural language query for the research agent.',
    example: 'How do I use Cloudflare D1 with Hono?',
  }),
  sessionId: z.string().optional().openapi({
    description: 'An existing session ID to continue a conversation.',
    example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
  }),
});

// ... other schemas

// --- API Route Definitions & Implementations ---
const chatRoute = createRoute({
  method: 'post',
  path: '/api/chat',
  summary: 'Start or continue a chat session',
  request: {
    body: {
      content: { 'application/json': { schema: ChatRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'The agent\'s response.',
      content: { 'application/json': { schema: ChatResponseSchema } },
    },
  },
});
```

### 3. Update `README.md`
- Open `README.md`.
- Update the API usage examples to reflect the final endpoint schemas.
- Add a section explaining the new WebSocket API (`/api/chat/ws`) and how to interact with it.
- Remove any outdated information.

### 4. Update `AGENTS.md`
- Open `AGENTS.md`.
- Document the final, multi-step agent workflow:
    1.  Clarification Phase
    2.  RAG / Knowledge Base Search
    3.  Planning Phase
    4.  Tool Execution Phase (including Sandbox)
    5.  Synthesis Phase
- List all the available tools (`cloudflare_docs`, `github_api`, `sandbox`, `browser`) and the subcommands/arguments they accept.

## Acceptance Criteria
- All Zod schemas in `src/index.ts` are fully defined and no longer placeholders.
- The generated `/openapi.json` is complete, accurate, and well-documented.
- The `README.md` provides correct and useful examples for all public API endpoints, including the WebSocket endpoint.
- The `AGENTS.md` file accurately describes the agent\'s internal logic and available tools.
