import { describe, expect, it, vi } from 'vitest';

import { searchDocs } from '../data/d1';

describe('searchDocs', () => {
  it('returns ranked results from the FTS index when available', async () => {
    const all = vi.fn().mockResolvedValue({
      results: [['1', 'workers', 'Intro', 'https://example.com', 'Snippet text', 0.8]],
    });
    const bind = vi.fn().mockReturnValue({ all });
    const prepare = vi.fn().mockReturnValue({ bind });
    const env = { DB: { prepare } as any };

    const results = await searchDocs(env, 'workers');

    expect(results).toEqual([
      {
        id: '1',
        product: 'workers',
        title: 'Intro',
        url: 'https://example.com',
        snippet: 'Snippet text',
        score: 0.8,
      },
    ]);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(bind).toHaveBeenCalledWith('workers', 5);
  });

  it('falls back to LIKE search when FTS errors', async () => {
    const ftsAll = vi.fn().mockRejectedValue(new Error('fts offline'));
    const ftsBind = vi.fn().mockReturnValue({ all: ftsAll });
    const fallbackAll = vi.fn().mockResolvedValue({
      results: [['2', 'pages', 'Workers Sites', 'https://example.com/site', 'Pages docs']],
    });
    const fallbackBind = vi.fn().mockReturnValue({ all: fallbackAll });
    const prepare = vi
      .fn()
      .mockReturnValueOnce({ bind: ftsBind })
      .mockReturnValueOnce({ bind: fallbackBind });

    const env = { DB: { prepare } as any };

    const results = await searchDocs(env, 'pages');

    expect(results[0].id).toBe('2');
    expect(results[0].score).toBeCloseTo(1);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(fallbackBind).toHaveBeenCalledWith('%pages%', 5);
  });
});
