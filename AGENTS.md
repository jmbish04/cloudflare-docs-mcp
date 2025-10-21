## 1. Core Vision: The Agent as an Orchestrator

The primary goal of this worker is to function as an **intelligent orchestrator**. It is an AI-powered research assistant that fields requests and then uses a suite of specialized, external tools to construct a comprehensive answer. It does not just search for data; it understands a request, selects the appropriate tool(s), executes them, and synthesizes the results into a single, actionable "information package" for the developer.

### Key Features:

1.  **Tool-Based Architecture:** The agent's capabilities are defined by a set of external tools configured in `tools.config.json`. This allows for modular and extensible functionality. The initial toolset includes:
    *   **Live Cloudflare Docs Search:** via `https://docs.mcp.cloudflare.com/mcp`.
    *   **Cloudflare Observability:** To review worker logs via `https://observability.mcp.cloudflare.com/mcp`.
    *   **Context7:** A third-party knowledge source.
    *   **GitHub API:** For fetching code examples and repository information.

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
