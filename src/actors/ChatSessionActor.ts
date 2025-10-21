/**
 * @file src/actors/ChatSessionActor.ts
 * @description The "General Research Agent" actor. It uses a suite of tools to answer user queries.
 */

import { Actor, Persist } from '@cloudflare/actors';
import { z } from 'zod';
import type { ChatSessionActorEnv } from '../env';
import { logTransaction } from '../data/d1';
import { DataAccessLayer } from '../data/dal';
import { VectorizeService } from '../data/vectorize_service';
import { StructuredResponseTool, EmbeddingTool } from '../ai-tools';
import { GitHubTool } from '../tools/github';
import { BrowserRender } from '../tools/browser';
import { SandboxTool } from '../tools/sandbox';
import { CloudflareDocsTool } from '../tools/cloudflare_docs';
import { RAGTool } from '../tools/rag_tool';

const ToolCallSchema = z.object({
  tool: z
    .string()
    .describe("The name of the tool to call (e.g., 'sandbox', 'github_api')."),
  args: z
    .object({
      subcommand: z.string().optional().describe("For tools with multiple functions (e.g., 'github_api')."),
      query: z.string().optional(),
      filename: z
        .string()
        .optional()
        .describe("The name of the file to write in the sandbox (e.g., 'test.js')."),
      code: z
        .string()
        .optional()
        .describe("The code to write to the file."),
      command: z
        .string()
        .optional()
        .describe("The shell command to execute in the sandbox."),
    })
    .passthrough()
    .describe("The arguments to pass to the tool."),
});

const ResearchPlanSchema = z.object({
  plan: z.array(z.string()).describe("A step-by-step plan for how to answer the user's query."),
  tool_calls: z.array(ToolCallSchema).describe("The sequence of tool calls required to execute the plan."),
});

const ClarificationCheckSchema = z.object({
  needsClarification: z
    .boolean()
    .describe(
      "Set to true if the user's query is ambiguous, too broad, or lacks specific details to create a concrete research plan.",
    ),
  clarifyingQuestion: z
    .string()
    .optional()
    .describe("If needsClarification is true, pose a specific question to the user to narrow down their request."),
});

type ClarificationCheck = z.infer<typeof ClarificationCheckSchema>;

interface ClarificationContext {
  originalQuery: string;
  clarifications: string[];
}

interface AgentMessage { role: 'user' | 'assistant'; content: string; }

export class ChatSessionActor extends Actor<ChatSessionActorEnv> {
  // @ts-expect-error Decorators use TC39 semantics
  @Persist private messageHistory: AgentMessage[] = [];

  private webSocket?: WebSocket;
  
  // Tooling Suite
  private structuredResponseTool: StructuredResponseTool;
  private embeddingTool: EmbeddingTool;
  private github: GitHubTool;
  private browser: BrowserRender;
  private sandbox: SandboxTool;
  private cloudflareDocs: CloudflareDocsTool;
  private ragTool: RAGTool;

  constructor(state: DurableObjectState, env: ChatSessionActorEnv) {
    super(state, env);
    this.structuredResponseTool = new StructuredResponseTool(env as any);
    this.embeddingTool = new EmbeddingTool(env as any);
    this.github = new GitHubTool(env as any);
    this.browser = new BrowserRender(env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN);
    this.sandbox = new SandboxTool(env.SANDBOX, `session-${this.state.id}`);
    this.cloudflareDocs = new CloudflareDocsTool(env.AI);
    const dal = new DataAccessLayer(env.DB);
    const vectorizeService = new VectorizeService(env.VECTORIZE_INDEX, env.AI, env.DEFAULT_MODEL_EMBEDDING);
    this.ragTool = new RAGTool(vectorizeService, dal);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }

      const { 0: client, 1: server } = new WebSocketPair();
      this.handleWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    try {
      const { query, sessionId } = (await request.json()) as { query: string; sessionId: string };
      if (!query) return Response.json({ error: 'Query is required.' }, { status: 400 });
      const result = await this.handleUserQuery(sessionId, query);
      return Response.json(result);
    } catch (error) {
      console.error('Error in ChatSessionActor:', error);
      return Response.json({ error: 'Failed to process chat request.' }, { status: 500 });
    }
  }

  private handleWebSocket(socket: WebSocket) {
    if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
      this.webSocket.close(1011, 'New connection established');
    }

    this.webSocket = socket;
    socket.accept();
    const sessionId = String(this.state.id);
    socket.addEventListener('message', (event) => {
      const data = typeof event.data === 'string' ? event.data : '';
      if (!data) {
        socket.send(JSON.stringify({ error: 'Invalid message format' }));
        return;
      }

      try {
        const parsed = JSON.parse(data) as { query?: string };
        if (!parsed.query) {
          socket.send(JSON.stringify({ error: 'Query is required' }));
          return;
        }

        void this.handleUserQuery(sessionId, parsed.query).catch((error) => {
          console.error('WebSocket query error:', error);
          this.sendUpdate('error', { message: 'Failed to process query.' });
        });
      } catch (error) {
        console.error('Invalid WebSocket message received:', error);
        socket.send(JSON.stringify({ error: 'Invalid message format' }));
      }
    });

    socket.addEventListener('close', () => {
      this.webSocket = undefined;
    });

    socket.addEventListener('error', () => {
      this.webSocket = undefined;
    });

    this.sendUpdate('session_started', { sessionId });
  }

  private sendUpdate(type: string, payload: unknown) {
    if (!this.webSocket) return;

    try {
      this.webSocket.send(JSON.stringify({ type, payload }));
    } catch (error) {
      console.error('Failed to send WebSocket update:', error);
    }
  }

  async handleUserQuery(sessionId: string, query: string): Promise<object> {
    try {
      await logTransaction(this.env, sessionId, 'USER_QUERY', { query });

      const awaitingKey = 'isAwaitingClarification';
      const contextKey = 'clarificationContext';
      const isAwaitingClarification = await this.state.storage.get<boolean>(awaitingKey);
      let clarificationContext = isAwaitingClarification
        ? await this.state.storage.get<ClarificationContext>(contextKey)
        : undefined;

      const getOriginalQuery = (): string => {
        if (clarificationContext?.originalQuery) return clarificationContext.originalQuery;
        const firstUserMessage = this.messageHistory.find((msg) => msg.role === 'user');
        return firstUserMessage?.content ?? query;
      };

      const formatFinalQuery = (original: string, clarifications: string[]): string => {
        if (!clarifications.length) return original;
        const formattedClarifications = clarifications.map((item, index) => `(${index + 1}) "${item}"`).join(' ');
        return `Original question was: "${original}". The user provided additional clarification(s): ${formattedClarifications}.`;
      };

      let finalQuery = query;

      if (isAwaitingClarification) {
        const originalQuery = getOriginalQuery();
        const previousClarifications = clarificationContext?.clarifications ?? [];
        const combinedClarifications = [...previousClarifications, query];
        finalQuery = formatFinalQuery(originalQuery, combinedClarifications);
        clarificationContext = { originalQuery, clarifications: combinedClarifications };
      }

      this.messageHistory.push({ role: 'user', content: query });

      const clarificationPrompt =
        `You are assessing whether the following user query requires clarification before creating a research plan.\n` +
        `If the query is ambiguous, too broad, or missing critical details, respond with needsClarification set to true and ` +
        `provide a single, specific clarifying question. If the query is sufficiently clear, respond with needsClarification set to false.\n` +
        `Query: "${finalQuery}"`;

      const clarificationResult = await this.structuredResponseTool.analyzeText(
        ClarificationCheckSchema,
        clarificationPrompt,
      );

      const clarificationDecision: ClarificationCheck | undefined =
        clarificationResult.success && clarificationResult.structuredResult
          ? clarificationResult.structuredResult
          : undefined;

      let clarificationMetadata: { needed: boolean; question?: string } = { needed: false };

      if (clarificationDecision?.needsClarification) {
        const question =
          clarificationDecision.clarifyingQuestion?.trim() || 'Could you please provide more details about what you need?';
        this.sendUpdate('clarification_needed', { question });
        this.messageHistory.push({ role: 'assistant', content: question });

        await this.state.storage.put(awaitingKey, true);
        const contextToStore =
          clarificationContext ?? ({ originalQuery: finalQuery, clarifications: [] } satisfies ClarificationContext);
        await this.state.storage.put(contextKey, contextToStore);
        clarificationMetadata = { needed: true, question };
        return { sessionId, response: question, clarification: clarificationMetadata };
      }

      await this.state.storage.delete(awaitingKey);
      await this.state.storage.delete(contextKey);

      this.sendUpdate('status', { message: 'Searching knowledge base...' });
      let knownContext = '';
      try {
        knownContext = await this.ragTool.searchKnowledgeBase(finalQuery);
      } catch (error) {
        console.error('RAG knowledge search failed:', error);
        knownContext = 'No curated knowledge could be retrieved due to an internal error.';
      }
      this.sendUpdate('rag_result', { context: knownContext });

      this.sendUpdate('status', { message: 'Creating research plan...' });

      const sanitizedContext = knownContext?.trim().length
        ? knownContext
        : 'No curated knowledge matched the query.';
      const planPrompt = `
        Based on the following known information, create a research plan to answer the user's query.
        Only create steps for information that is missing.

        Known Information:
        ---
        ${sanitizedContext}
        ---

        User Query: "${finalQuery}"

        Available Tools:
        - You have access to a sandbox tool. You can use it in two ways:
          1. Execute a shell command: {"tool": "sandbox", "args": {"command": "ls -l"}}
          2. Write and run a script: {"tool": "sandbox", "args": {"filename": "verify.js", "code": "console.log(1+1);"}}
        Use the sandbox to verify information or perform calculations when necessary.
      `.trim();
      const planResult = await this.structuredResponseTool.analyzeText(ResearchPlanSchema, planPrompt);

      if (!planResult.success || !planResult.structuredResult) {
        const errorMessage = "I'm sorry, I was unable to create a research plan.";
        await logTransaction(this.env, sessionId, 'ERROR_CREATE_PLAN', { error: planResult.error });
        this.sendUpdate('error', { message: errorMessage, details: planResult.error });
        return { sessionId, response: errorMessage, error: planResult.error, clarification: clarificationMetadata };
      }

      const plan = planResult.structuredResult;
      await logTransaction(this.env, sessionId, 'CREATE_PLAN', { plan });
      this.sendUpdate('plan_created', { plan });

      const toolResults: Array<{ tool: string; result: unknown }> = [];
      for (const call of plan.tool_calls) {
        this.sendUpdate('tool_start', { tool: call.tool, args: call.args });
        let result: unknown;
        try {
          result = await this.executeTool(call.tool, call.args);
        } catch (error) {
          console.error(`Tool ${call.tool} execution failed:`, error);
          result = { error: (error as Error).message ?? 'Tool execution failed.' };
        }
        toolResults.push({ tool: call.tool, result });
        this.sendUpdate('tool_end', { tool: call.tool, result });
        await logTransaction(this.env, sessionId, `TOOL_RUN_${call.tool.toUpperCase()}`, { result });
      }

      this.sendUpdate('status', { message: 'Synthesizing final answer...' });

      const synthesisPrompt = `Query: "${finalQuery}"

Tool Results:
${JSON.stringify(toolResults, null, 2)}

Synthesize a final answer.`;
      const finalResponse = await this.runSynthesis(synthesisPrompt);

      await logTransaction(this.env, sessionId, 'FINAL_RESPONSE', { response: finalResponse });
      this.messageHistory.push({ role: 'assistant', content: finalResponse });

      this.sendUpdate('final_response', { response: finalResponse });

      const normalizedPlan = {
        steps: plan.plan,
        toolCalls: plan.tool_calls.map((call) => ({ tool: call.tool, args: call.args })),
      };

      return {
        sessionId,
        response: finalResponse,
        plan: normalizedPlan,
        tool_results: toolResults,
        clarification: clarificationMetadata,
      };
    } catch (error) {
      console.error('Unexpected error while handling user query:', error);
      const errorMessage = 'An unexpected error occurred while processing the query.';
      this.sendUpdate('error', { message: errorMessage });
      await logTransaction(this.env, sessionId, 'UNEXPECTED_ERROR', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        sessionId,
        response: errorMessage,
        error: error instanceof Error ? error.message : String(error),
        clarification: { needed: false },
      };
    }
  }

  private async executeTool(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'github_api':
        switch (args.subcommand) {
          case 'search_repos':
            return this.github.searchRepositories(args.query, args.language, args.limit);
          case 'search_issues':
            return this.github.searchIssues(args.query, args.repo, args.limit);
          case 'get_file_content':
            return this.github.getFileContent(args.owner, args.repo, args.path);
          case 'get_repo_contents':
            return this.github.getRepoContents(args.owner, args.repo, args.path);
          case 'get_pr_diff':
            return this.github.getPullRequestDiff(args.owner, args.repo, args.prNumber);
          default:
            return { error: `GitHub subcommand ${args.subcommand} not found.` };
        }
      case 'browser': return this.browser.scrape({ url: args.url, elements: args.elements });
      case 'sandbox':
        if (args?.code && args?.filename) {
          return this.sandbox.runScript(args.filename, args.code);
        }
        if (args?.command) {
          return this.sandbox.exec(args.command);
        }
        return { error: 'Sandbox tool requires either a `command` or `code` and `filename`.' };
      case 'cloudflare_docs': return this.cloudflareDocs.search(args.query);
      // ... other tool cases
      default: return { error: `Tool ${toolName} not found.` };
    }
  }

  private async runSynthesis(prompt: string): Promise<string> {
    const model = this.env.DEFAULT_MODEL_REASONING as keyof AiModels;
    const response = await this.env.AI.run(model, { prompt });
    return (response as { response?: string }).response || 'Failed to generate a response.';
  }
}
