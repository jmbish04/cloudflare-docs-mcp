/**
 * @file src/tools/rag_tool.ts
 * @description Retrieval-Augmented Generation helper for querying curated knowledge.
 */

import type { DataAccessLayer } from '../data/dal';
import type { VectorizeService, VectorQueryResult } from '../data/vectorize_service';

export class RAGTool {
  constructor(
    private readonly vectorizeService: VectorizeService,
    private readonly dal: DataAccessLayer,
  ) {}

  async searchKnowledgeBase(query: string): Promise<string> {
    let matches: VectorQueryResult[] = [];
    try {
      matches = await this.vectorizeService.query(query);
    } catch (error) {
      console.error('Vectorize query failed:', error);
      return 'No curated knowledge could be retrieved due to an internal error.';
    }

    if (!matches.length) {
      return 'No curated knowledge matched the query.';
    }

    const uniqueIds = matches
      .map((match) => Number.parseInt(match.id, 10))
      .filter((id) => Number.isFinite(id))
      .filter((value, index, array) => array.indexOf(value) === index) as number[];

    if (!uniqueIds.length) {
      return 'Related knowledge was found, but no retrievable document identifiers were provided.';
    }

    const records = await this.dal.getCuratedKnowledgeByIds(uniqueIds);
    if (!records.length) {
      return 'No curated knowledge records were found for the retrieved identifiers.';
    }

    const recordMap = new Map(records.map((record) => [record.id, record]));

    const sections: string[] = [];
    for (const [index, match] of matches.entries()) {
      const id = Number.parseInt(match.id, 10);
      const record = Number.isFinite(id) ? recordMap.get(id) : undefined;
      if (!record) continue;

      const header = `(${index + 1}) ${record.title}`;
      const metadataParts: string[] = [];
      if (record.source_url) metadataParts.push(`Source: ${record.source_url}`);
      if (record.tags) metadataParts.push(`Tags: ${record.tags}`);
      const metadataLine = metadataParts.length ? `\n${metadataParts.join(' | ')}` : '';
      const scoreLine = Number.isFinite(match.score) ? `\nRelevance Score: ${match.score.toFixed(3)}` : '';
      sections.push(`${header}${metadataLine}${scoreLine}\n${record.content}`);
    }

    if (!sections.length) {
      return 'No curated knowledge could be formatted for this query.';
    }

    return sections.join('\n\n');
  }
}
