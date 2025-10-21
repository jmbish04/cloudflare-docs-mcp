/**
 * @file src/tools/github.ts
 * @description Provides a high-level adapter around the GitHub REST API via Octokit.
 */

import { Octokit } from '@octokit/rest';
import type { CoreEnv } from '../env';

const USER_AGENT = 'Cloudflare-AI-Research-Assistant';

export interface Repository {
  owner: string;
  repo: string;
  fullName: string;
  description: string | null;
  stars: number;
  url: string;
}

export interface Issue {
  title: string;
  url: string;
  number: number;
  state: 'open' | 'closed';
  author: string;
  body: string | null;
}

export class GitHubTool {
  private client: Octokit;

  constructor(env: CoreEnv) {
    const token = (env as any).GITHUB_TOKEN as string | undefined;

    this.client = new Octokit({
      auth: token,
      userAgent: USER_AGENT,
    });

    if (!token) {
      console.warn('GITHUB_TOKEN secret is not set. GitHub API requests will be unauthenticated and rate-limited.');
    }
  }

  async getPullRequestDiff(owner: string, repo: string, prNumber: number): Promise<string> {
    const response = await this.client.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      headers: {
        Accept: 'application/vnd.github.v3.diff',
      },
    });

    return response.data as unknown as string;
  }

  async getRepoContents(owner: string, repo: string, path: string = ''): Promise<Endpoints['GET /repos/{owner}/{repo}/contents/{path}']['response']['data']> {
    const response = await this.client.rest.repos.getContent({
      owner,
      repo,
      path: path || '',
    });

    return response.data;
  }

  async searchRepositories(query: string, language?: string, limit: number = 10): Promise<Repository[]> {
    const searchQuery = language ? `${query} language:${language}` : query;
    const response = await this.client.rest.search.repos({
      q: searchQuery,
      per_page: limit,
    });

    return response.data.items.map((item) => ({
      owner: item.owner?.login ?? '',
      repo: item.name,
      fullName: item.full_name,
      description: item.description,
      stars: item.stargazers_count,
      url: item.html_url,
    }));
  }

  async searchIssues(query: string, repoFullName?: string, limit: number = 10): Promise<Issue[]> {
    const scopedQuery = repoFullName ? `${query} repo:${repoFullName}` : query;
    const response = await this.client.rest.search.issuesAndPullRequests({
      q: scopedQuery,
      per_page: limit,
    });

    return response.data.items.map((item) => ({
      title: item.title,
      url: item.html_url,
      number: item.number,
      state: item.state as 'open' | 'closed',
      author: item.user?.login ?? 'unknown',
      body: item.body ?? null,
    }));
  }

  async getFileContent(owner: string, repo: string, path: string): Promise<{ content: string; path: string } | null> {
    try {
      const response = await this.client.rest.repos.getContent({ owner, repo, path });
      const data = response.data;

      if (Array.isArray(data) || !('type' in data) || data.type !== 'file' || !('content' in data)) {
        return null;
      }

      const encoded = (data as { content?: string }).content;
      if (!encoded) {
        return null;
      }

      const content = this.decodeBase64(encoded);
      return { content, path: data.path };
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'status' in error && (error as { status?: number }).status === 404) {
        return null;
      }
      throw error;
    }
  }

  private decodeBase64(value: string): string {
    const normalized = value.replace(/\s+/g, '');

    if (typeof Buffer !== 'undefined') {
      return Buffer.from(normalized, 'base64').toString('utf-8');
    }

    const binaryString = atob(normalized);
    const bytes = Uint8Array.from(binaryString, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
}
