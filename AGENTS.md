# AGENTS.md: The Centralized Instruction & Vision Document

This document is the single source of truth for the development of the `cloudflare-docs-mcp` worker. It outlines the project's vision, architecture, and the specific roles of the Cloudflare technologies we use. All development should adhere to the principles and requirements laid out here.

## 1. Core Vision & Product Requirements

The primary goal of this worker is to function as an intelligent, AI-powered research assistant specializing in Cloudflare development. It is not merely a documentation search tool; it is a context-aware agent that provides comprehensive, actionable "information packages" to AI developers.

### Key Features:

1.  **Multi-Source Research:** The agent performs "deep research" by consulting multiple sources in parallel:
    *   **Primary Source (Live):** The official, real-time **Cloudflare Docs SSE server**. This ensures the information is always up-to-date with the latest official documentation.
    *   **Secondary Source (Curated):** A **D1 Database** that serves as a living archive of best practices, common gotchas, standardized code guidelines, and nuanced patterns (e.g., setting up Next.js on Pages, using Shadcn with Workers). This is knowledge curated by us to supplement official docs.
    *   **Tertiary Source (Future):** The architecture will be modular to allow for the integration of additional third-party knowledge sources, such as Context7.

2.  **Intelligent Consultation:** The agent will not just passively answer questions. It will be designed to initiate a consultation, asking clarifying questions to gather the full context of a developer's problem before beginning its research.

3.  **Sandboxed Code Verification:** The agent will have the ability to test its theories. It will use a sandboxed environment (via **Cloudflare Workers for Platforms**) to:
    *   Verify code snippets and solutions.
    *   Attempt to replicate user-reported errors to gather more diagnostic information.
    *   Confirm the accuracy of its proposed solutions before delivering them.

4.  **Feedback Loop for Curation:** The system will include a feedback mechanism. The AI developer receiving the information package can report back on whether the solution was effective. This feedback will be used to continuously curate and improve the quality of the information in the D1 database.

5.  **Dual API Exposure:** The worker will be accessible via two primary interfaces:
    *   **MCP (Model-Context-Protocol):** For direct interaction with Gemini and other MCP-compatible agents.
    *   **Public API (WebSocket):** A public-facing endpoint with a generated OpenAPI 3.1.0 schema, specifically for integration with third-party tools like ChatGPT Custom Actions.

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
