import { Actor, Persist } from '@cloudflare/actors';
import { D1Env, ProductDocumentRow, searchProductDocuments } from '../d1';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatSessionState {
  sessionId: string;
  messageHistory: ChatMessage[];
  lastActivityTimestamp: number | null;
  lastProductId: string | null;
}

export type ChatSessionActorEnv = D1Env & {
  AI?: { run: (model: string, input: unknown) => Promise<unknown> };
  AI_MODEL?: string;
};

interface HandleUserQueryOptions {
  productId?: string;
  topK?: number;
}

export class ChatSessionActor extends Actor<ChatSessionActorEnv> {
  // @ts-expect-error Cloudflare Actors decorator uses the Stage 3 field decorator signature.
  @Persist
  private state: ChatSessionState = {
    sessionId: '',
    messageHistory: [],
    lastActivityTimestamp: null,
    lastProductId: null,
  };

  protected async onInit(): Promise<void> {
    if (!this.state.sessionId) {
      this.state.sessionId = this.name ?? crypto.randomUUID();
    }
  }

  async handleUserQuery(query: string, options: HandleUserQueryOptions = {}): Promise<{
    sessionId: string;
    response: string;
    documents: ProductDocumentRow[];
  }> {
    this.ensureSessionId();

    const productId = options.productId ?? this.state.lastProductId ?? undefined;
    this.state.messageHistory.push({ role: 'user', content: query });
    this.state.lastActivityTimestamp = Date.now();
    if (productId) {
      this.state.lastProductId = productId;
    }

    const documents = await searchProductDocuments(
      this.env,
      query,
      options.topK ?? 5,
      productId
    );
    const assistantReply = await this.generateAssistantReply(query, documents);

    this.state.messageHistory.push({ role: 'assistant', content: assistantReply });
    this.state.lastActivityTimestamp = Date.now();

    return {
      sessionId: this.state.sessionId,
      response: assistantReply,
      documents,
    };
  }

  async getHistory(): Promise<ChatMessage[]> {
    this.ensureSessionId();
    return [...this.state.messageHistory];
  }

  protected async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const [, action] = url.pathname.split('/');

    if (request.method === 'POST' && action === 'query') {
      const raw = await request.json().catch(() => ({}));
      const body = raw as Partial<{ query: string; productId: string; topK: number }>;
      const query = typeof body.query === 'string' ? body.query : '';
      const productId = typeof body.productId === 'string' ? body.productId : undefined;
      const topK = typeof body.topK === 'number' ? body.topK : undefined;

      if (!query) {
        return Response.json({ error: 'Query is required.' }, { status: 400 });
      }

      try {
        const result = await this.handleUserQuery(query, { productId, topK });
        return Response.json(result);
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error ? error.message : 'Failed to process query.',
          },
          { status: 500 }
        );
      }
    }

    if (request.method === 'GET' && action === 'history') {
      return Response.json({ sessionId: this.state.sessionId, history: await this.getHistory() });
    }

    return new Response('Not Found', { status: 404 });
  }

  private ensureSessionId(): void {
    if (!this.state.sessionId) {
      this.state.sessionId = this.name ?? crypto.randomUUID();
    }
  }

  private async generateAssistantReply(
    query: string,
    documents: ProductDocumentRow[]
  ): Promise<string> {
    const historyContext = this.state.messageHistory
      .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
      .join('\n');

    const docsContext = documents
      .map(
        (doc, index) =>
          `Document ${index + 1}: ${doc.title}\nURL: ${doc.url || 'N/A'}\nContent: ${doc.content.slice(0, 500)}`
      )
      .join('\n\n');

    const prompt =
      `You are a Cloudflare documentation assistant. Use the provided documentation snippets to answer the user's question.
Existing conversation:
${historyContext || 'No previous messages.'}

Relevant documentation:
${docsContext || 'No documents matched the query.'}

User query: ${query}

Provide a concise, technically accurate response that cites the relevant documents when possible.`;

    if (this.env.AI && this.env.AI_MODEL) {
      try {
        const raw = await this.env.AI.run(this.env.AI_MODEL, { prompt });
        const text = this.normalizeAIResponse(raw);
        if (text) {
          return text;
        }
      } catch (error) {
        console.warn('AI generation failed, falling back to heuristic response.', error);
      }
    }

    return this.createFallbackResponse(query, documents);
  }

  private normalizeAIResponse(raw: unknown): string {
    if (typeof raw === 'string') {
      return raw.trim();
    }

    if (Array.isArray(raw)) {
      return raw.map((entry) => String(entry)).join('\n');
    }

    if (raw && typeof raw === 'object') {
      if ('response' in raw && typeof (raw as any).response === 'string') {
        return (raw as any).response.trim();
      }
      if ('output_text' in raw && typeof (raw as any).output_text === 'string') {
        return (raw as any).output_text.trim();
      }
      if ('choices' in raw && Array.isArray((raw as any).choices)) {
        const choice = (raw as any).choices[0];
        if (choice && typeof choice.text === 'string') {
          return choice.text.trim();
        }
      }
    }

    return '';
  }

  private createFallbackResponse(query: string, documents: ProductDocumentRow[]): string {
    if (!documents.length) {
      return `I couldn't find documentation matching "${query}". Please refine the request or try a different product.`;
    }

    const summary = documents
      .map((doc, index) => `(${index + 1}) ${doc.title}${doc.url ? ` - ${doc.url}` : ''}`)
      .join('\n');

    return `Based on the documentation I found, here are some relevant references:\n${summary}`;
  }
}

export type ChatSessionActorStub = ReturnType<typeof ChatSessionActor.get>;
