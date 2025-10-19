/**
 * @file src/tools/github.ts
 * @description This module provides a dedicated interface for interacting with the GitHub API.
 * It handles authentication and abstracts the logic for fetching repository contents,
 * pull request diffs, and other essential GitHub data.
 */

import type { CoreEnv } from '../env';

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * @class GitHubService
 * @description A service for making authenticated requests to the GitHub API.
 */
export class GitHubService {
  private token: string;

  constructor(env: CoreEnv) {
    // In a real environment, the GITHUB_TOKEN would be a secret.
    this.token = (env as any).GITHUB_TOKEN;
    if (!this.token) {
      console.warn('GITHUB_TOKEN secret is not set. GitHub API requests will be unauthenticated and rate-limited.');
    }
  }

  private async request(path: string): Promise<any> {
    const headers: HeadersInit = {
      'User-Agent': 'Cloudflare-AI-Research-Assistant',
      'Accept': 'application/vnd.github.v3+json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${GITHUB_API_BASE}${path}`, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API request to ${path} failed with status ${response.status}: ${errorText}`);
    }
    return response.json();
  }

  /**
   * @method getPullRequestDiff
   * @description Fetches the diff for a specific pull request.
   * @param {string} owner - The repository owner.
   * @param {string} repo - The repository name.
   * @param {number} prNumber - The pull request number.
   * @returns {Promise<string>} The raw diff content.
   */
  async getPullRequestDiff(owner: string, repo: string, prNumber: number): Promise<string> {
    const path = `/repos/${owner}/${repo}/pulls/${prNumber}`;
    const headers: HeadersInit = {
      'User-Agent': 'Cloudflare-AI-Research-Assistant',
      'Accept': 'application/vnd.github.v3.diff', // Request the diff format
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${GITHUB_API_BASE}${path}`, { headers });

    if (!response.ok) {
      throw new Error(`GitHub API request for PR diff failed with status ${response.status}`);
    }
    return response.text();
  }

  /**
   * @method getRepoContents
   * @description Fetches the contents of a directory in a repository.
   * @param {string} owner - The repository owner.
   * @param {string} repo - The repository name.
   * @param {string} path - The path to the directory or file.
   * @returns {Promise<any>} The file or directory content metadata.
   */
  async getRepoContents(owner: string, repo: string, path: string = ''): Promise<any> {
    const repoPath = `/repos/${owner}/${repo}/contents/${path}`;
    return this.request(repoPath);
  }
}
