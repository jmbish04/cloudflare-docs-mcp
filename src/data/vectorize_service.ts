/**
 * @file src/data/vectorize_service.ts
 * @description Provides a strongly-typed wrapper around Cloudflare Vectorize for
 *              embedding generation and semantic search across curated knowledge.
 */

export interface VectorizeDocumentInput {
  id: string;
  text: string;
  metadata: Record<string, VectorizeVectorMetadata>;
}

export interface VectorQueryResult {
  id: string;
  score: number;
  values?: number[];
  namespace?: string;
  metadata?: Record<string, VectorizeVectorMetadata>;
}

export class VectorizeService {
  constructor(
    private readonly vectorizeIndex: VectorizeIndex,
    private readonly ai: Ai,
    private readonly embeddingModel: string,
  ) {}

  async upsertDocument(document: VectorizeDocumentInput): Promise<void> {
    const vector = await this.generateEmbedding(document.text);
    await this.vectorizeIndex.upsert([
      {
        id: document.id,
        values: vector,
        metadata: document.metadata,
      },
    ]);
  }

  async query(queryText: string, topK: number = 5): Promise<VectorQueryResult[]> {
    const vector = await this.generateEmbedding(queryText);
    const matches = await this.vectorizeIndex.query(vector, { topK });
    return (matches.matches ?? []).map((match) => ({
      id: match.id,
      score: match.score,
      values: Array.isArray(match.values) ? (match.values as number[]) : undefined,
      namespace: match.namespace,
      metadata: (match.metadata ?? undefined) as Record<string, VectorizeVectorMetadata> | undefined,
    }));
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const model = this.embeddingModel as keyof AiModels;
    const response = await this.ai.run(model, { text: [text] });

    if (
      typeof response === 'object' &&
      response !== null &&
      'data' in response &&
      Array.isArray(response.data) &&
      response.data.length > 0 &&
      Array.isArray(response.data[0])
    ) {
      return response.data[0] as number[];
    }

    throw new Error('Failed to generate embedding vector.');
  }
}
