import { describe, it, expect, vi, beforeEach } from 'vitest';

const { CloudflareMock, getClient, resetClient } = vi.hoisted(() => {
  const createBrowserClient = () => ({
    browserRendering: {
      screenshot: { create: vi.fn().mockResolvedValue({ body: 'screenshot' }) },
      pdf: { create: vi.fn().mockResolvedValue({ body: 'pdf' }) },
      snapshot: { create: vi.fn().mockResolvedValue({ id: 'snapshot' }) },
      scrape: { create: vi.fn().mockResolvedValue({ records: [] }) },
      json: { create: vi.fn().mockResolvedValue({ response: {} }) },
      links: { create: vi.fn().mockResolvedValue({ links: [] }) },
      markdown: { create: vi.fn().mockResolvedValue({ markdown: '# Title' }) },
    },
  });
  let client = createBrowserClient();
  const mock = vi.fn(() => client);
  return {
    CloudflareMock: mock,
    getClient: () => client,
    resetClient: () => {
      client = createBrowserClient();
      mock.mockImplementation(() => client);
    },
  };
});

vi.mock('cloudflare', () => ({ default: CloudflareMock }));

const { BrowserRender } = await import('./browser');

describe('BrowserRender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetClient();
  });

  it('requires an account id', () => {
    expect(() => new BrowserRender('')).toThrowError('Cloudflare account ID is required.');
  });

  it('creates screenshot through API', async () => {
    const tool = new BrowserRender('acct', 'token');
    const stream = await tool.takeScreenshot({ url: 'https://example.com' });
    expect(getClient().browserRendering.screenshot.create).toHaveBeenCalledWith({ account_id: 'acct', url: 'https://example.com' });
    expect(stream).toBe('screenshot');
  });

  it('creates pdf through API', async () => {
    const tool = new BrowserRender('acct');
    const stream = await tool.generatePdf({ url: 'https://example.com' });
    expect(getClient().browserRendering.pdf.create).toHaveBeenCalledWith({ account_id: 'acct', url: 'https://example.com' });
    expect(stream).toBe('pdf');
  });

  it('delegates to snapshot endpoint', async () => {
    const tool = new BrowserRender('acct');
    const response = await tool.takeSnapshot({ url: 'https://example.com' });
    expect(getClient().browserRendering.snapshot.create).toHaveBeenCalledWith({ account_id: 'acct', url: 'https://example.com' });
    expect(response).toEqual({ id: 'snapshot' });
  });

  it('delegates to scrape endpoint', async () => {
    const tool = new BrowserRender('acct');
    const response = await tool.scrape({ url: 'https://example.com', elements: [] });
    expect(getClient().browserRendering.scrape.create).toHaveBeenCalledWith({ account_id: 'acct', url: 'https://example.com', elements: [] });
    expect(response).toEqual({ records: [] });
  });

  it('delegates to json endpoint', async () => {
    const tool = new BrowserRender('acct');
    await tool.extractJson({ url: 'https://example.com' });
    expect(getClient().browserRendering.json.create).toHaveBeenCalledWith({ account_id: 'acct', url: 'https://example.com' });
  });

  it('delegates to links endpoint', async () => {
    const tool = new BrowserRender('acct');
    await tool.getLinks({ url: 'https://example.com' } as any);
    expect(getClient().browserRendering.links.create).toHaveBeenCalledWith({ account_id: 'acct', url: 'https://example.com' });
  });

  it('delegates to markdown endpoint', async () => {
    const tool = new BrowserRender('acct');
    await tool.getMarkdown({ url: 'https://example.com' } as any);
    expect(getClient().browserRendering.markdown.create).toHaveBeenCalledWith({ account_id: 'acct', url: 'https://example.com' });
  });
});
