import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RAGTool } from './rag_tool';

describe('RAGTool', () => {
  const query = vi.fn();
  const getCuratedKnowledgeByIds = vi.fn();
  const tool = new RAGTool({ query } as any, { getCuratedKnowledgeByIds } as any);

  beforeEach(() => {
    query.mockReset();
    getCuratedKnowledgeByIds.mockReset();
  });

  it('formats curated knowledge into sections', async () => {
    query.mockResolvedValue([
      { id: '1', score: 0.9 },
      { id: '2', score: 0.8 },
      { id: '1', score: 0.7 },
    ]);
    getCuratedKnowledgeByIds.mockResolvedValue([
      { id: 1, title: 'Doc 1', content: 'Content 1', source_url: 'https://example.com', tags: 'tag', is_active: true, time_inactive: null, is_highlighted: false, time_highlighted: null, created_at: '', updated_at: '' },
      { id: 2, title: 'Doc 2', content: 'Content 2', source_url: null, tags: null, is_active: true, time_inactive: null, is_highlighted: true, time_highlighted: null, created_at: '', updated_at: '' },
    ]);

    const result = await tool.searchKnowledgeBase('workers');

    expect(query).toHaveBeenCalledWith('workers');
    expect(getCuratedKnowledgeByIds).toHaveBeenCalledWith([1, 2]);
    expect(result).toContain('(1) Doc 1');
    expect(result).toContain('Source: https://example.com');
    expect(result).toContain('Content 2');
  });

  it('returns friendly error when vectorize fails', async () => {
    query.mockRejectedValue(new Error('vector down'));
    const result = await tool.searchKnowledgeBase('workers');
    expect(result).toBe('No curated knowledge could be retrieved due to an internal error.');
  });

  it('handles no matches', async () => {
    query.mockResolvedValue([]);
    const result = await tool.searchKnowledgeBase('workers');
    expect(result).toBe('No curated knowledge matched the query.');
  });

  it('handles non numeric ids', async () => {
    query.mockResolvedValue([{ id: 'abc', score: 0.5 }]);
    const result = await tool.searchKnowledgeBase('workers');
    expect(result).toBe('Related knowledge was found, but no retrievable document identifiers were provided.');
  });

  it('handles missing records', async () => {
    query.mockResolvedValue([{ id: '1', score: 0.5 }]);
    getCuratedKnowledgeByIds.mockResolvedValue([]);
    const result = await tool.searchKnowledgeBase('workers');
    expect(result).toBe('No curated knowledge records were found for the retrieved identifiers.');
  });

  it('handles matches without records to format', async () => {
    query.mockResolvedValue([{ id: '1', score: 0.5 }]);
    getCuratedKnowledgeByIds.mockResolvedValue([{ id: 2, title: 'Doc 2', content: 'Content 2', source_url: null, tags: null, is_active: true, time_inactive: null, is_highlighted: false, time_highlighted: null, created_at: '', updated_at: '' }]);
    const result = await tool.searchKnowledgeBase('workers');
    expect(result).toBe('No curated knowledge could be formatted for this query.');
  });
});
