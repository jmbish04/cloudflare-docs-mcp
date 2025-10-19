/**
 * @file src/actors/ChatSessionActor.ts
 * @description This file defines the ChatSessionActor, a Durable Object responsible for managing
 * the state and logic of a single conversation. It orchestrates the research process by
 * delegating to a specialized research agent.
 */

import { Actor, Persist } from '@cloudflare/actors';
import type { ChatSessionActorEnv } from '../env';

// Define the structure for a message in the conversation history
interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * @class ChatSessionActor
 * @description A stateful actor that manages a single chat session. It persists the message
 * history and orchestrates the agent's research and response generation process.
 * It is built using the Cloudflare Agents SDK, which is based on Durable Objects.
 */
export class ChatSessionActor extends Actor<ChatSessionActorEnv> {
  // Persist the message history across actor invocations.
  // @ts-expect-error Decorators from @cloudflare/actors use TC39 semantics not yet modelled by tsc
  @Persist
  private messageHistory: AgentMessage[] = [];

  /**
   * @method fetch
   * @description This is the entry point for all requests to this actor instance. It handles
   * the incoming chat query and returns the agent's response. This aligns with the
   * unified routing model where the main worker forwards the request here.
   * @param {Request} request - The incoming HTTP request from the main worker.
   * @returns {Promise<Response>} A promise that resolves to the HTTP response.
   */
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const { query, sessionId } = (await request.json()) as { query: string; sessionId: string };
      if (!query) {
        return Response.json({ error: 'Query is required.' }, { status: 400 });
      }

      const result = await this.handleUserQuery(sessionId, query);
      return Response.json(result);
    } catch (error) {
      console.error('Error in ChatSessionActor:', error);
      return Response.json({ error: 'Failed to process chat request.' }, { status: 500 });
    }
  }

  /**
   * @method handleUserQuery
   * @description Orchestrates the process of generating a response to a user's query.
   * This method will be expanded to perform multi-source research.
   * @param {string} sessionId - The ID of the current session.
   * @param {string} query - The user's query.
   * @returns {Promise<object>} A promise that resolves to the agent's response package.
   */
  async handleUserQuery(sessionId: string, query: string): Promise<object> {
    // Add user message to history
    this.messageHistory.push({ role: 'user', content: query });

    // --- Placeholder for the new multi-source research agent ---
    // In the next steps, this is where we will:
    // 1. Create a new research agent.
    // 2. The agent will query the live Cloudflare Docs SSE.
    // 3. The agent will query the curated D1 database.
    // 4. The agent will synthesize the results.
    // 5. The agent will potentially use a sandbox for verification.

    const assistantResponse = `This is a placeholder response for the query: "${query}". The multi-source research agent has not been implemented yet.`;
    // --- End of Placeholder ---

    // Add assistant response to history
    this.messageHistory.push({ role: 'assistant', content: assistantResponse });

    return {
      sessionId,
      response: assistantResponse,
    };
  }
}
