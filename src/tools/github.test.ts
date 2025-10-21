import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CoreEnv } from '../env';

const { OctokitMock, mockSearchRepos, mockSearchIssues, mockGetContent, mockGetPull } = vi.hoisted(() => {
  const mockSearchRepos = vi.fn();
  const mockSearchIssues = vi.fn();
  const mockGetContent = vi.fn();
  const mockGetPull = vi.fn();
  const OctokitMock = vi.fn(() => ({
    rest: {
      search: {
        repos: mockSearchRepos,
        issuesAndPullRequests: mockSearchIssues,
      },
      repos: {
        getContent: mockGetContent,
      },
      pulls: {
        get: mockGetPull,
      },
    },
  }));
  return { OctokitMock, mockSearchRepos, mockSearchIssues, mockGetContent, mockGetPull };
});

vi.mock('@octokit/rest', () => ({ Octokit: OctokitMock }));

const { GitHubTool } = await import('./github');

describe('GitHubTool', () => {
  const createTool = () => new GitHubTool({ GITHUB_TOKEN: 'token' } as unknown as CoreEnv);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('searchRepositories formats query and maps items', async () => {
    mockSearchRepos.mockResolvedValue({
      data: {
        items: [
          {
            owner: { login: 'cloudflare' },
            name: 'workers-sdk',
            full_name: 'cloudflare/workers-sdk',
            description: 'SDK',
            stargazers_count: 100,
            html_url: 'https://github.com/cloudflare/workers-sdk',
          },
        ],
      },
    });

    const tool = createTool();
    const results = await tool.searchRepositories('workers', 'typescript', 5);

    expect(mockSearchRepos).toHaveBeenCalledWith({ q: 'workers language:typescript', per_page: 5 });
    expect(results).toEqual([
      {
        owner: 'cloudflare',
        repo: 'workers-sdk',
        fullName: 'cloudflare/workers-sdk',
        description: 'SDK',
        stars: 100,
        url: 'https://github.com/cloudflare/workers-sdk',
      },
    ]);
  });

  it('searchIssues scopes query when repo is provided', async () => {
    mockSearchIssues.mockResolvedValue({
      data: {
        items: [
          {
            title: 'Bug',
            html_url: 'https://github.com/issue',
            number: 42,
            state: 'open',
            user: { login: 'alice' },
            body: 'details',
          },
        ],
      },
    });

    const tool = createTool();
    const results = await tool.searchIssues('memory leak', 'cloudflare/workers-sdk', 3);

    expect(mockSearchIssues).toHaveBeenCalledWith({ q: 'memory leak repo:cloudflare/workers-sdk', per_page: 3 });
    expect(results).toEqual([
      {
        title: 'Bug',
        url: 'https://github.com/issue',
        number: 42,
        state: 'open',
        author: 'alice',
        body: 'details',
      },
    ]);
  });

  it('getRepoContents delegates to octokit', async () => {
    const mockData = [{ path: 'README.md' }];
    mockGetContent.mockResolvedValue({ data: mockData });

    const tool = createTool();
    const results = await tool.getRepoContents('cloudflare', 'workers-sdk', 'src');

    expect(mockGetContent).toHaveBeenCalledWith({ owner: 'cloudflare', repo: 'workers-sdk', path: 'src' });
    expect(results).toBe(mockData);
  });

  it('getPullRequestDiff requests diff media type', async () => {
    mockGetPull.mockResolvedValue({ data: 'diff-data' });

    const tool = createTool();
    const diff = await tool.getPullRequestDiff('cloudflare', 'workers-sdk', 12);

    expect(mockGetPull).toHaveBeenCalledWith({
      owner: 'cloudflare',
      repo: 'workers-sdk',
      pull_number: 12,
      headers: { Accept: 'application/vnd.github.v3.diff' },
    });
    expect(diff).toBe('diff-data');
  });

  it('getFileContent decodes base64 content', async () => {
    const encoded = Buffer.from('hello world').toString('base64');
    mockGetContent.mockResolvedValue({
      data: {
        type: 'file',
        path: 'README.md',
        content: encoded,
      },
    });

    const tool = createTool();
    const result = await tool.getFileContent('cloudflare', 'docs', 'README.md');

    expect(result).toEqual({ content: 'hello world', path: 'README.md' });
  });

  it('getFileContent returns null for 404', async () => {
    const error = new Error('Not Found') as Error & { status?: number };
    error.status = 404;
    mockGetContent.mockRejectedValue(error);

    const tool = createTool();
    await expect(tool.getFileContent('cloudflare', 'docs', 'README.md')).resolves.toBeNull();
  });

  it('getFileContent ignores directories', async () => {
    mockGetContent.mockResolvedValue({ data: [{ path: 'src' }] });
    const tool = createTool();
    const result = await tool.getFileContent('cloudflare', 'docs', 'src');
    expect(result).toBeNull();
  });
});
