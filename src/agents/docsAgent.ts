/**
 * Stateless DocsAgent orchestrator used by chat actors.
 *
 * The implementation favours determinism: all search side-effects live in the
 * provided D1 binding, while LLM invocations are optional and fail-safe.
 */

import { searchDocs, type DocsDatabaseEnv, type DocsSearchResult } from '../data/d1';

export type AgentMessage = { role: 'user' | 'assistant'; content: string };

export interface DocsAgentEnv extends DocsDatabaseEnv {
  /**
   * Optional Workers AI binding. When omitted we fall back to deterministic
   * summaries so the chat endpoint remains useful in local development.
   */
  AI?: { run: (model: string, input: unknown) => Promise<unknown> };
  /**
   * Preferred model dedicated to the docs agent.
   */
  DOCS_AGENT_MODEL?: string;
  /**
   * Generic AI model fallback shared with other components.
   */
  AI_MODEL?: string;
}

export interface DocsAgentResponse {
  answer: string;
  citations: DocsSearchResult[];
}

export interface DocsAgent {
  runConversation(messages: AgentMessage[]): Promise<DocsAgentResponse>;
}

const SYSTEM_PROMPT = [
  'You are a Cloudflare documentation expert.',
  'Respond with concise, technically accurate answers.',
  'Always cite relevant documentation URLs using Markdown links when possible.',
  'If the corpus does not contain an answer say so explicitly.',
].join(' ');

export function createDocsAgent(env: DocsAgentEnv): DocsAgent {
  return {
    async runConversation(messages) {
      const trimmedHistory = trimHistory(messages, 10);
      const latestUser = [...trimmedHistory].reverse().find((msg) => msg.role === 'user');
      const question = latestUser?.content ?? '';

      const citations = await searchDocs(env, question || deriveFallbackQuery(trimmedHistory));
      const contextualAnswer = await runModel(env, trimmedHistory, citations);
      const rendered = contextualAnswer?.trim().length
        ? contextualAnswer.trim()
        : renderFallbackAnswer(question, citations);

      return { answer: rendered, citations };
    },
  } satisfies DocsAgent;
}

function trimHistory(history: AgentMessage[], maxMessages: number): AgentMessage[] {
  if (history.length <= maxMessages) {
    return history;
  }
  return history.slice(history.length - maxMessages);
}

async function runModel(
  env: DocsAgentEnv,
  messages: AgentMessage[],
  citations: DocsSearchResult[]
): Promise<string | null> {
  const model = env.DOCS_AGENT_MODEL ?? env.AI_MODEL;
  if (!model || !env.AI) {
    return null;
  }

  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
      {
        role: 'system',
        content: formatCitationsForPrompt(citations),
      },
    ],
  };

  try {
    const response = await env.AI.run(model, payload);
    return normaliseAiResponse(response);
  } catch (error) {
    console.error('DocsAgent AI invocation failed, falling back to deterministic response.', error);
    return null;
  }
}

function formatCitationsForPrompt(results: DocsSearchResult[]): string {
  if (!results.length) {
    return 'No documentation matches were retrieved.';
  }
  const lines = results.map((result, index) => {
    const rank = index + 1;
    return `#${rank}: ${result.title} -> ${result.url}\n${result.snippet}`;
  });
  return `Documentation snippets:\n${lines.join('\n\n')}`;
}

function normaliseAiResponse(response: unknown): string | null {
  if (typeof response === 'string') {
    return response;
  }
  if (response && typeof response === 'object') {
    if ('response' in response && typeof (response as any).response === 'string') {
      return (response as any).response;
    }
    if ('result' in response && typeof (response as any).result === 'string') {
      return (response as any).result;
    }
    if ('choices' in response && Array.isArray((response as any).choices)) {
      const choice = (response as any).choices[0];
      if (choice && typeof choice === 'object' && typeof choice.message?.content === 'string') {
        return choice.message.content;
      }
    }
  }
  return null;
}

function renderFallbackAnswer(question: string, citations: DocsSearchResult[]): string {
  if (!citations.length) {
    return [
      'I could not find a matching article in the synced Cloudflare documentation.',
      'Try a different query or run a sync for this product first.',
    ].join(' ');
  }

  const intro = question
    ? `Here are the most relevant Cloudflare doc snippets for "${question}":`
    : 'Here are the most recent Cloudflare doc snippets:';

  const bullets = citations
    .slice(0, 5)
    .map((result) => `- [${result.title}](${result.url}) — ${result.snippet}`)
    .join('\n');

  return `${intro}\n${bullets}`;
}

function deriveFallbackQuery(history: AgentMessage[]): string {
  return history
    .slice()
    .reverse()
    .find((msg) => msg.role === 'user')?.content.trim() ?? '';
}
