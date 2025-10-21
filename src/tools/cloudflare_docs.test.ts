import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloudflareDocsTool } from './cloudflare_docs';

describe('CloudflareDocsTool', () => {
  const run = vi.fn();
  const tool = new CloudflareDocsTool({ run } as any);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns filtered mock results on success', async () => {
    run.mockResolvedValue({ data: [[0.1, 0.2, 0.3]] });

    const results = await tool.search('workers durable object patterns');

    expect(run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', { text: ['workers durable object patterns'] });
    expect(results.isError).toBe(false);
    expect(results.totalResults).toBeGreaterThan(0);
    expect(results.results.every((item) => item.score > 0.7)).toBe(true);
  });

  it('returns error payload when embedding call fails', async () => {
    run.mockRejectedValue(new Error('network failure'));

    const results = await tool.search('anything');

    expect(results).toEqual({
      results: [],
      totalResults: 0,
      isError: true,
      systemMessage: expect.stringContaining('network failure'),
    });
  });
});
