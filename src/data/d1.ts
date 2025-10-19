/**
 * Data access utilities for the D1-backed documentation corpus.
 *
 * These helpers are deliberately light-weight so they can be imported by
 * Workers, Actors, and Agents without creating cyclic dependencies.
 */

export interface DocsDatabaseEnv {
  /**
   * Primary documentation database binding configured in wrangler.toml.
   */
  DB: D1Database;
}

export interface DocsSearchResult {
  id: string;
  product: string;
  title: string;
  url: string;
  snippet: string;
  score: number;
}

const DEFAULT_RESULT_LIMIT = 5;

/**
 * Perform a relevance-ranked search against the documentation corpus.
 *
 * The underlying schema exposes both a content table (`docs`) and an
 * FTS-backed virtual table (`docs_fts`). When the FTS table is unavailable
 * the helper degrades gracefully to a simple LIKE filter so reads never fail.
 */
export async function searchDocs(
  env: DocsDatabaseEnv,
  q: string,
  limit: number = DEFAULT_RESULT_LIMIT
): Promise<DocsSearchResult[]> {
  const query = q.trim();
  if (!query) {
    return [];
  }

  const resultLimit = normalizeLimit(limit);

  const ftsResults = await queryWithFts(env, query, resultLimit);
  if (ftsResults.length > 0) {
    return ftsResults;
  }

  return queryWithFallback(env, query, resultLimit);
}

function normalizeLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) {
    return DEFAULT_RESULT_LIMIT;
  }
  return Math.min(Math.max(Math.floor(limit), 1), 20);
}

async function queryWithFts(env: DocsDatabaseEnv, query: string, limit: number) {
  try {
    const statement = env.DB.prepare(
      `SELECT d.id, d.product, d.title, d.url, d.snippet,
              COALESCE(1.0 / (1.0 + bm25(docs_fts, 1.0, 0.2, 0.1)), 0) AS relevance
         FROM docs_fts
         JOIN docs d ON d.id = docs_fts.id
        WHERE docs_fts MATCH ?1
        ORDER BY relevance DESC
        LIMIT ?2`
    ).bind(query, limit);

    const { results } = await statement.all<
      Array<
        [
          string,
          string,
          string,
          string,
          string,
          number
        ]
      >
    >();

    return (results ?? []).map((row, index) => {
      const [id, product, title, url, snippet, relevance] = row as unknown as [
        string,
        string,
        string,
        string,
        string,
        number | null
      ];
      return {
        id,
        product,
        title,
        url,
        snippet,
        score: typeof relevance === 'number' && Number.isFinite(relevance)
          ? relevance
          : deriveFallbackScore(index),
      } satisfies DocsSearchResult;
    });
  } catch (error) {
    console.warn('FTS search failed, falling back to LIKE query.', error);
    return [];
  }
}

async function queryWithFallback(env: DocsDatabaseEnv, query: string, limit: number) {
  const wildcard = `%${query.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
  const statement = env.DB.prepare(
    `SELECT id, product, title, url, snippet
       FROM docs
      WHERE title LIKE ?1 ESCAPE '\\' OR snippet LIKE ?1 ESCAPE '\\'
      ORDER BY updated_at DESC
      LIMIT ?2`
  ).bind(wildcard, limit);

  const { results } = await statement.all<
    Array<[string, string, string, string, string]>
  >();

  return (results ?? []).map((row, index) => {
    const [id, product, title, url, snippet] = row as unknown as [
      string,
      string,
      string,
      string,
      string
    ];
    return {
      id,
      product,
      title,
      url,
      snippet,
      score: deriveFallbackScore(index),
    } satisfies DocsSearchResult;
  });
}

function deriveFallbackScore(rank: number) {
  return Math.max(0, 1 - rank * 0.1);
}
