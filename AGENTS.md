## 1. Core Vision: The Agent as an Orchestrator

The primary goal of this worker is to function as an **intelligent orchestrator**. It is an AI-powered research assistant that fields requests and then uses a suite of specialized, external tools to construct a comprehensive answer. It does not just search for data; it understands a request, selects the appropriate tool(s), executes them, and synthesizes the results into a single, actionable "information package" for the developer.

### Multi-Step Agent Workflow

1. **Clarification Phase** – Every chat turn begins with a clarification check powered by the structured-response model. The agent determines whether the query is sufficiently scoped. When clarification is required the agent stores state in Durable Object storage, asks the follow-up question, and pauses downstream planning until the user responds.
2. **RAG / Knowledge Base Search** – Once the query is clear, the agent consults the curated D1 knowledge base and the Vectorize index. The RAG tool aggregates highlighted entries, curated notes, and recent ingestion results into a knowledge summary that is fed into planning.
3. **Planning Phase** – The agent drafts a research plan describing the major steps and the ordered list of tool invocations. This plan is exposed through the API so clients can preview which tools will execute.
4. **Tool Execution Phase** – Tools run in sequence. Long-running or stateful tasks (sandbox scripts, GitHub lookups, browser rendering) emit WebSocket updates so the client can observe progress. Tool outputs are collected and attached to the final response for transparency.
5. **Synthesis Phase** – The reasoning model synthesizes the gathered evidence into a final answer, grounding the explanation on tool outputs and RAG context. Feasibility jobs follow the same pattern asynchronously, with results written to D1 and exposed via `/api/jobs/:id/packet`.

### Key Features:

1.  **Tool-Based Architecture:** The agent's capabilities are defined by a set of external tools configured in `tools.config.json`. This allows for modular and extensible functionality. The production toolset includes:
    *   **Cloudflare Docs Search (`cloudflare_docs`)**
    *   **GitHub API (`github_api`)**
    *   **Sandbox (`sandbox`)**
    *   **Browser Rendering (`browser`)**

2.  **Multi-Source Research:** The agent performs "deep research" by consulting multiple sources in parallel:
    *   **Primary Source (Tools):** The agent will invoke the external tools listed above.
    *   **Secondary Source (Curated):** A **D1 Database** that serves as a living archive of best practices, common gotchas, and standardized code guidelines. This is knowledge curated by us to supplement the tools.
    *   **Tertiary Source (Vectorized Code):** An on-demand vectorization pipeline will allow the agent to search a Vectorize index for relevant code examples from sources like GitHub.

3.  **Intelligent Consultation:** The agent will not just passively answer questions. It will be designed to initiate a consultation, asking clarifying questions to gather the full context of a developer's problem before selecting and using its tools.

4.  **Sandboxed Code Verification:** The agent will have the ability to test its theories. It will use a sandboxed environment (via **Cloudflare Workers for Platforms**) to:
    *   Verify code snippets and solutions found by its tools.
    *   Attempt to replicate user-reported errors to gather more diagnostic information.
    *   Confirm the accuracy of its proposed solutions before delivering them.

5.  **Feedback Loop & Logging:** Every transaction (tool execution, D1 query, etc.) will be logged to a D1 `transactions` table, providing a full audit trail. A feedback mechanism will allow clients to report on the effectiveness of solutions, which will be used to curate the D1 knowledge base.

### Tool Catalog

| Tool | Description | Subcommands / Arguments |
| --- | --- | --- |
| `cloudflare_docs` | Vector-backed search across curated Cloudflare documentation and ingestion results. | `query` (string) – required search phrase. |
| `github_api` | Wrapper around GitHub REST API for repository discovery and inspection. | `subcommand` must be one of:<br>• `search_repos` – args: `query` (string), `language` (string, optional), `limit` (number, optional)<br>• `search_issues` – args: `query` (string), `repo` (string, optional), `limit` (number, optional)<br>• `get_file_content` – args: `owner` (string), `repo` (string), `path` (string)<br>• `get_repo_contents` – args: `owner` (string), `repo` (string), `path` (string, optional)<br>• `get_pr_diff` – args: `owner` (string), `repo` (string), `prNumber` (number) |
| `sandbox` | Executes commands inside the Cloudflare Sandbox Durable Object. | Either supply `command` (string) to run a shell command, or `filename` (string) + `code` (string) to write and execute a script. Additional helpers exist for repo cloning and context creation at the tool level. |
| `browser` | Proxies the Cloudflare Browser Rendering APIs for scraping or rich captures. | Primary args: `url` (string). Depending on the action the agent sets `elements` for scrape, `screenshotOptions`/`viewport` for screenshots, or other rendering parameters. |

6.  **Dual API Exposure:** The worker will be accessible via two primary interfaces:
    *   **MCP (Model-Context-Protocol):** A `POST /mcp` endpoint for direct interaction with Gemini and other MCP-compatible agents.
    *   **Public API (WebSocket):** A public-facing endpoint (e.g., `POST /api/chat`) with a generated OpenAPI 3.1.0 schema, specifically for integration with third-party tools like ChatGPT Custom Actions. The primary protocol will evolve to WebSockets for interactive sessions.

## 2. Architecture & Technology

### Unified Routing

To ensure maintainability, all requests, whether from the MCP interface or the public API, will be routed to a single, unified core logic block. The entry points will be thin adapters that parse the request into a standardized format before passing it to the central handler. The primary protocol for the public API will be WebSockets to support real-time, interactive sessions.

### Cloudflare Technology Stack

*   **Cloudflare Agents SDK:** This is the core SDK used to build the stateful, persistent agent. The agent class will encapsulate the logic for consultation, research, sandboxing, and packaging information.

*   **Cloudflare Actors (Durable Objects):** The Agents SDK is built on Durable Objects. We use them to ensure that each research session (or user) has its own persistent, stateful agent instance. This allows the agent to remember context throughout a conversation.

*   **Durable Object Bindings:** The `wrangler.toml` file will contain the necessary bindings to link our agent class to a namespace that the worker can use to spawn and communicate with agent instances.

*   **Cloudflare D1:** Our curated knowledge base of best practices, gotchas, and code styles will be stored and queried from a D1 database.

*   **Cloudflare Workers for Platforms:** This will be used to create the secure, sandboxed environments for code verification and error replication.

*   **Cloudflare Queues & Workflows (Future):** These may be integrated in the future to handle more complex, asynchronous tasks, such as batch processing of feedback to update the D1 database or orchestrating multi-step research processes that could take a significant amount of time.
