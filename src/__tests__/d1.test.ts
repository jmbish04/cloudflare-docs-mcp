import { describe, expect, it, vi } from 'vitest';
import { generateEmbedding, listBestPractices } from '../d1';

describe('D1 helpers', () => {
  it('parses embeddings stored in the database results', async () => {
    const all = vi.fn().mockResolvedValue({
      results: [
        { id: '1', topic: 'Caching', text: 'Use cache API', embedding: '[1,2,3]' },
        { id: '2', topic: 'Workers', text: 'Keep requests short', embedding: 'not-json' },
      ],
    });
    const prepare = vi.fn().mockReturnValue({ all });
    const env = { DB: { prepare } as any };

    const practices = await listBestPractices(env);

    expect(prepare).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id, topic, text, embedding FROM best_practices')
    );
    expect(practices).toEqual([
      { id: '1', topic: 'Caching', text: 'Use cache API', embedding: [1, 2, 3] },
      { id: '2', topic: 'Workers', text: 'Keep requests short', embedding: [] },
    ]);
  });

  it('uses the AI provider response when available during embedding generation', async () => {
    const ai = {
      run: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2] }),
    };

    const result = await generateEmbedding({ AI: ai, AI_MODEL: 'cf/model' }, 'example');

    expect(ai.run).toHaveBeenCalledWith('cf/model', expect.any(Object));
    expect(result).toEqual([0.1, 0.2]);
  });

  it('falls back to a zero vector when embedding generation fails', async () => {
    const ai = {
      run: vi.fn().mockRejectedValue(new Error('boom')),
    };

    const result = await generateEmbedding({ AI: ai, AI_MODEL: 'cf/model' }, 'example');

    expect(result).toHaveLength(16);
    expect(new Set(result)).toEqual(new Set([0]));
  });
});
