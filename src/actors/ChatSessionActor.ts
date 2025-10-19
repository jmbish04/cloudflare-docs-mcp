/**
 * ChatSessionActor persists conversational state for a single session ID.
 *
 * It orchestrates each turn by delegating to the DocsAgent helper which in
 * turn coordinates retrieval against the D1 corpus and optional LLM calls.
 */

import { Actor, Persist } from '@cloudflare/actors';

import { createDocsAgent, type AgentMessage } from '../agents/docsAgent';
import type { ChatSessionActorEnv } from '../env';

const MAX_HISTORY_LENGTH = 50;

type RpcEnvelope = {
  method: 'handleUserQuery' | 'getHistory';
  params?: Record<string, unknown>;
};

export class ChatSessionActor extends Actor<ChatSessionActorEnv> {
  // @ts-expect-error Decorators from @cloudflare/actors use TC39 semantics not yet modelled by tsc
  @Persist
  private messageHistory: AgentMessage[] = [];

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/rpc') {
      const payload = (await request.json().catch(() => null)) as RpcEnvelope | null;
      if (!payload || typeof payload.method !== 'string') {
        return Response.json({ error: 'Invalid RPC payload.' }, { status: 400 });
      }

      if (payload.method === 'handleUserQuery') {
        const sessionId = typeof payload.params?.sessionId === 'string' ? payload.params.sessionId : this.name;
        const query = typeof payload.params?.query === 'string' ? payload.params.query : '';
        if (!query.trim()) {
          return Response.json({ error: 'Query must not be empty.' }, { status: 400 });
        }
        return Response.json(await this.handleUserQuery(sessionId ?? 'default', query));
      }

      if (payload.method === 'getHistory') {
        return Response.json({ history: this.messageHistory });
      }

      return Response.json({ error: `Unknown RPC method ${payload.method}` }, { status: 400 });
    }

    if (request.method === 'GET' && url.pathname === '/status') {
      return Response.json({ historyLength: this.messageHistory.length });
    }

    return Response.json({ error: 'Not Found' }, { status: 404 });
  }

  async handleUserQuery(sessionId: string, query: string) {
    const question = query.trim();
    const userMessage: AgentMessage = { role: 'user', content: question };
    const updatedHistory = [...this.messageHistory, userMessage];

    const agent = createDocsAgent(this.env);
    console.log(JSON.stringify({ event: 'chat.turn.start', sessionId, messageCount: updatedHistory.length }));
    const response = await agent.runConversation(updatedHistory);

    const assistantMessage: AgentMessage = { role: 'assistant', content: response.answer };
    this.messageHistory = [...updatedHistory, assistantMessage].slice(-MAX_HISTORY_LENGTH);

    console.log(
      JSON.stringify({
        event: 'chat.turn.finish',
        sessionId,
        citations: response.citations.map((item) => item.url),
      })
    );

    return {
      reply: response.answer,
      citations: response.citations,
      historyLength: this.messageHistory.length,
    };
  }
}