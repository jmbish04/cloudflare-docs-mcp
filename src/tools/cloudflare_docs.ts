/**
 * @file src/tools/cloudflare_docs.ts
 * @description Tool adapter for searching Cloudflare documentation using vector search.
 */

// --- Interfaces ---

/**
 * A single search result from the Cloudflare Docs search.
 */
export interface SearchResult {
  url: string;
  title: string;
  contentSnippet: string;
  score: number;
}

/**
 * The complete search results response.
 */
export interface SearchResults {
  /** The array of search result items. Empty if an error occurred. */
  results: SearchResult[];
  /** The total number of results found. 0 if an error occurred. */
  totalResults: number;
  /** Flag indicating if an error occurred during the search. */
  isError: boolean;
  /** A system message, typically containing error details if isError is true. */
  systemMessage: string | null;
}

// --- CloudflareDocsTool Class ---

/**
 * A tool for searching Cloudflare documentation using vector embeddings and search.
 * This tool encapsulates the logic for querying the Cloudflare Docs search API.
 */
export class CloudflareDocsTool {
  private ai: any;

  /**
   * Constructs a new CloudflareDocsTool instance.
   * @param aiBinding The Cloudflare AI binding for generating embeddings and running models.
   */
  constructor(aiBinding: any) {
    this.ai = aiBinding;
  }

  /**
   * Searches the Cloudflare documentation using a vector search model.
   *
   * This method generates embeddings for the query and searches for relevant
   * documentation pages. In a production implementation, this would query a
   * Vectorize index populated with Cloudflare documentation content.
   *
   * @param query The search query string.
   * @returns A promise that resolves to the search results, including error state.
   */
  async search(query: string): Promise<SearchResults> {
    try {
      // Generate embeddings for the search query
      // Using the BGE (BAAI General Embedding) model for semantic search
      const embeddings: { data: number[][] } = await this.ai.run('@cf/baai/bge-base-en-v1.5', {
        text: [query]
      });

      const vectors = embeddings.data[0];

      console.log(`Searching Cloudflare Docs for: "${query}"`);
      console.log(`Generated embedding vector of length: ${vectors?.length || 0}`);

      // In a real implementation, you would query a Vectorize index here.
      // The Vectorize index would be populated with embeddings of Cloudflare docs.
      // Example:
      // const matches = await env.VECTORIZE_INDEX.query(vectors, { topK: 5 });

      // For now, returning mock results that demonstrate the expected structure.
      // These mock results cover key Cloudflare products that users commonly ask about.
      const mockResults: SearchResult[] = [
        {
          url: 'https://developers.cloudflare.com/workers/',
          title: 'Cloudflare Workers',
          contentSnippet: 'Cloudflare Workers provides a serverless execution environment that allows you to create entirely new applications or augment existing ones without configuring or maintaining infrastructure.',
          score: 0.92,
        },
        {
          url: 'https://developers.cloudflare.com/d1/',
          title: 'Cloudflare D1',
          contentSnippet: 'Cloudflare D1 is a serverless SQL database built on SQLite. D1 allows you to build applications that handle large amounts of data without managing infrastructure.',
          score: 0.87,
        },
        {
          url: 'https://developers.cloudflare.com/vectorize/',
          title: 'Vectorize',
          contentSnippet: 'Vectorize is Cloudflare\'s vector database for building full-stack AI applications. Use Vectorize to store and efficiently query vector embeddings from AI models.',
          score: 0.85,
        },
        {
          url: 'https://developers.cloudflare.com/workers-ai/',
          title: 'Workers AI',
          contentSnippet: 'Run machine learning models, powered by serverless GPUs, on Cloudflare\'s global network. Workers AI allows you to run AI models with low latency and high availability.',
          score: 0.83,
        },
        {
          url: 'https://developers.cloudflare.com/pages/',
          title: 'Cloudflare Pages',
          contentSnippet: 'Cloudflare Pages is a JAMstack platform for frontend developers to collaborate and deploy websites. Deploy your sites directly from your git repository.',
          score: 0.78,
        },
      ];

      // Filter and sort results based on relevance (in a real implementation,
      // this would be done by the Vectorize index)
      const filteredResults = mockResults
        .filter(result => result.score > 0.7) // Only return relevant results
        .sort((a, b) => b.score - a.score); // Sort by score descending

      return {
        results: filteredResults,
        totalResults: filteredResults.length,
        isError: false,
        systemMessage: null
      };
    } catch (error: any) {
      console.error('Error searching Cloudflare Docs:', error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Return empty results on error rather than throwing
      // This allows the agent to continue processing even if search fails
      return {
        results: [],
        totalResults: 0,
        isError: true,
        systemMessage: `Error searching Cloudflare Docs: ${errorMessage}`
      };
    }
  }
}
