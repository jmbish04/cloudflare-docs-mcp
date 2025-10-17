import { D1Env, generateEmbedding, insertTransactionLog, listBestPractices } from './d1';
import {
  CodeConsultationRequest,
  CodeConsultationResponse,
  SearchDocsRequest,
  SearchDocsResponse,
} from './schemas';

export interface AgentEnv extends D1Env {
  AI?: { run: (model: string, input: unknown) => Promise<unknown> };
  AI_MODEL?: string;
}

export type SearchDocsInvoker = (payload: SearchDocsRequest) => Promise<SearchDocsResponse>;

export class ConsultationAgent {
  constructor(private readonly env: AgentEnv) {}

  async runCodeConsultation(
    input: CodeConsultationRequest,
    searchDocs: SearchDocsInvoker
  ): Promise<CodeConsultationResponse> {
    const topK = typeof input.metadata?.topK === 'number' ? input.metadata.topK : undefined;
    const docsResponse = await searchDocs({ query: input.consult_query, topK: topK ?? 3 });
    const bestPractices = await listBestPractices(this.env);

    const clarifyingQuestions = await this.generateClarifyingQuestions(input, docsResponse, bestPractices);

    const queryResponses = [
      {
        query: input.consult_query,
        response: this.renderDocsSummary(docsResponse),
      },
      ...clarifyingQuestions.map((question) => ({
        query: question,
        response: 'TODO: capture responses to clarifying questions using AI chain-of-thought.',
      })),
    ];

    const consultOverview = this.composeOverview(input, docsResponse, bestPractices);
    const codePatches = this.createPatchSuggestion(input, docsResponse, bestPractices);
    const codeFixed = this.createPatchedCode(input.code_string, codePatches);

    const responsePayload: CodeConsultationResponse = {
      query_responses: queryResponses,
      consult_overview: consultOverview,
      code_patches: codePatches,
      code_fixed: codeFixed,
    };

    const requestEmbedding = await generateEmbedding(this.env, JSON.stringify(input));
    const responseEmbedding = await generateEmbedding(this.env, JSON.stringify(responsePayload));

    await insertTransactionLog(this.env, {
      request_payload: input,
      response_payload: responsePayload,
      request_embedding: requestEmbedding,
      response_embedding: responseEmbedding,
    });

    return responsePayload;
  }

  private async generateClarifyingQuestions(
    input: CodeConsultationRequest,
    docs: SearchDocsResponse,
    bestPractices: Awaited<ReturnType<typeof listBestPractices>>
  ): Promise<string[]> {
    if (!this.env.AI || !this.env.AI_MODEL) {
      return [];
    }

    try {
      const prompt = `You are generating clarifying questions for a code consultation.\n` +
        `User query: ${input.consult_query}\n` +
        `Code snippet: ${input.code_string.slice(0, 2000)}\n` +
        `Best practices: ${bestPractices.map((bp) => `- ${bp.topic}: ${bp.text}`).join('\n')}\n` +
        `Docs context titles: ${docs.results.map((r) => r.title).join(', ')}\n` +
        `Return up to 2 short questions in JSON array form.`;

      const raw = await this.env.AI.run(this.env.AI_MODEL, { prompt });
      if (Array.isArray(raw)) {
        return raw.map((item) => String(item));
      }
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
        } catch {
          return raw ? [raw] : [];
        }
      }
      if (typeof raw === 'object' && raw !== null && Array.isArray((raw as any).questions)) {
        return (raw as any).questions.map((q: unknown) => String(q));
      }
    } catch (error) {
      console.warn('Clarifying question generation failed.', error);
    }

    return [];
  }

  private renderDocsSummary(docs: SearchDocsResponse): string {
    if (!docs.results.length) {
      return 'No documentation snippets returned.';
    }

    return docs.results
      .map((result, index) => {
        const rank = index + 1;
        return `#${rank} ${result.title}: ${result.content.slice(0, 280)}...`;
      })
      .join('\n');
  }

  private composeOverview(
    input: CodeConsultationRequest,
    docs: SearchDocsResponse,
    bestPractices: Awaited<ReturnType<typeof listBestPractices>>
  ): string {
    const highlights = bestPractices.slice(0, 3).map((bp) => `- ${bp.topic}: ${bp.text}`);
    return [
      `Consultation requested for query: ${input.consult_query}`,
      `Documentation context (${docs.results.length} hits):`,
      this.renderDocsSummary(docs),
      `Relevant best practices:`,
      highlights.length ? highlights.join('\n') : 'No best practices captured yet.',
      'TODO: Expand with AI-generated recommendations and risk assessment.',
    ].join('\n');
  }

  private createPatchSuggestion(
    input: CodeConsultationRequest,
    docs: SearchDocsResponse,
    bestPractices: Awaited<ReturnType<typeof listBestPractices>>
  ): string {
    const practiceHints = bestPractices
      .map((bp) => `# ${bp.topic}\n${bp.text}`)
      .join('\n\n');

    return [
      '--- original.ts',
      '+++ suggested.ts',
      '@@ TODO: Replace with actual diff hunk @@',
      practiceHints ? `// Best practice hints:\n${practiceHints}` : '// TODO: Add targeted diff based on best practices.',
    ].join('\n');
  }

  private createPatchedCode(code: string, patch: string): string {
    // TODO: Apply structured diff to code once the patch generator is wired up.
    return `${code}\n\n/* Suggested patch diff:\n${patch}\n*/`;
  }
}
