/**
 * GitHub MCP Mixin
 *
 * Provides GitHub MCP integration for agents.
 * Uses MCPToolAdapter to communicate with @modelcontextprotocol/server-github
 */

import {
  MCPToolAdapter,
  MCPToolResult,
} from '../mcp-tool-adapter.js';

/**
 * GitHub Issue
 */
export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  assignees: string[];
  url: string;
  html_url: string;
  created_at: string;
  updated_at: string;
}

/**
 * GitHub Pull Request
 */
export interface GitHubPullRequest {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  url: string;
  html_url: string;
  draft: boolean;
  mergeable: boolean | null;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
}

/**
 * GitHub File Content
 */
export interface GitHubFileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  content: string;
  encoding: string;
}

/**
 * GitHub PR File
 */
export interface GitHubPRFile {
  sha: string;
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

/**
 * GitHub API Error
 */
export class GitHubAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly rateLimitRemaining?: number,
    public readonly rateLimitReset?: Date
  ) {
    super(message);
    this.name = 'GitHubAPIError';
  }

  isRateLimited(): boolean {
    return this.statusCode === 403 && this.rateLimitRemaining === 0;
  }

  isAuthError(): boolean {
    return this.statusCode === 401;
  }

  isNotFound(): boolean {
    return this.statusCode === 404;
  }
}

/**
 * GitHub MCP Server name constant
 */
export const GITHUB_MCP_SERVER = 'github';

/**
 * GitHub MCP Mixin Interface
 */
export interface GitHubMCPMixin {
  mcp: MCPToolAdapter;
  owner: string;
  repo: string;
}

/**
 * Parse GitHub API error from MCP result
 */
export function parseGitHubError(result: MCPToolResult): GitHubAPIError {
  const errorMessage = result.error || 'Unknown GitHub API error';

  // Try to extract status code from error message
  let statusCode: number | undefined;
  const statusMatch = errorMessage.match(/status[:\s]+(\d{3})/i);
  if (statusMatch) {
    statusCode = parseInt(statusMatch[1], 10);
  }

  // Check for rate limit errors
  let rateLimitRemaining: number | undefined;
  let rateLimitReset: Date | undefined;
  if (errorMessage.toLowerCase().includes('rate limit')) {
    rateLimitRemaining = 0;
  }

  return new GitHubAPIError(
    errorMessage,
    statusCode,
    rateLimitRemaining,
    rateLimitReset
  );
}

/**
 * Create Issue via GitHub MCP
 */
export async function createGitHubIssue(
  mcp: MCPToolAdapter,
  payload: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    labels?: string[];
    assignees?: string[];
  }
): Promise<GitHubIssue> {
  const result = await mcp.callToolWithRetry(GITHUB_MCP_SERVER, 'create_issue', payload);

  if (!result.success) {
    throw parseGitHubError(result);
  }

  return result.data as GitHubIssue;
}

/**
 * Update Issue via GitHub MCP
 */
export async function updateGitHubIssue(
  mcp: MCPToolAdapter,
  payload: {
    owner: string;
    repo: string;
    issue_number: number;
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
    labels?: string[];
    assignees?: string[];
  }
): Promise<GitHubIssue> {
  const result = await mcp.callToolWithRetry(GITHUB_MCP_SERVER, 'update_issue', payload);

  if (!result.success) {
    throw parseGitHubError(result);
  }

  return result.data as GitHubIssue;
}

/**
 * Get Issue via GitHub MCP
 */
export async function getGitHubIssue(
  mcp: MCPToolAdapter,
  payload: {
    owner: string;
    repo: string;
    issue_number: number;
  }
): Promise<GitHubIssue> {
  const result = await mcp.callToolWithRetry(GITHUB_MCP_SERVER, 'get_issue', payload);

  if (!result.success) {
    throw parseGitHubError(result);
  }

  return result.data as GitHubIssue;
}

/**
 * Add Issue Comment via GitHub MCP
 */
export async function addIssueComment(
  mcp: MCPToolAdapter,
  payload: {
    owner: string;
    repo: string;
    issue_number: number;
    body: string;
  }
): Promise<{ id: number; body: string; url: string }> {
  const result = await mcp.callToolWithRetry(GITHUB_MCP_SERVER, 'add_issue_comment', payload);

  if (!result.success) {
    throw parseGitHubError(result);
  }

  return result.data as { id: number; body: string; url: string };
}

/**
 * List Issues via GitHub MCP
 */
export async function listGitHubIssues(
  mcp: MCPToolAdapter,
  payload: {
    owner: string;
    repo: string;
    state?: 'open' | 'closed' | 'all';
    labels?: string;
    per_page?: number;
    page?: number;
  }
): Promise<GitHubIssue[]> {
  const result = await mcp.callToolWithRetry(GITHUB_MCP_SERVER, 'list_issues', payload);

  if (!result.success) {
    throw parseGitHubError(result);
  }

  return result.data as GitHubIssue[];
}

/**
 * Search Issues via GitHub MCP
 */
export async function searchGitHubIssues(
  mcp: MCPToolAdapter,
  payload: {
    q: string;
    sort?: 'created' | 'updated' | 'comments';
    order?: 'asc' | 'desc';
    per_page?: number;
    page?: number;
  }
): Promise<{ total_count: number; items: GitHubIssue[] }> {
  const result = await mcp.callToolWithRetry(GITHUB_MCP_SERVER, 'search_issues', payload);

  if (!result.success) {
    throw parseGitHubError(result);
  }

  return result.data as { total_count: number; items: GitHubIssue[] };
}

/**
 * Create Pull Request via GitHub MCP
 */
export async function createGitHubPullRequest(
  mcp: MCPToolAdapter,
  payload: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
    draft?: boolean;
  }
): Promise<GitHubPullRequest> {
  const result = await mcp.callToolWithRetry(GITHUB_MCP_SERVER, 'create_pull_request', payload);

  if (!result.success) {
    throw parseGitHubError(result);
  }

  return result.data as GitHubPullRequest;
}

/**
 * Get Pull Request via GitHub MCP
 */
export async function getGitHubPullRequest(
  mcp: MCPToolAdapter,
  payload: {
    owner: string;
    repo: string;
    pull_number: number;
  }
): Promise<GitHubPullRequest> {
  const result = await mcp.callToolWithRetry(GITHUB_MCP_SERVER, 'get_pull_request', payload);

  if (!result.success) {
    throw parseGitHubError(result);
  }

  return result.data as GitHubPullRequest;
}

/**
 * List Pull Requests via GitHub MCP
 */
export async function listGitHubPullRequests(
  mcp: MCPToolAdapter,
  payload: {
    owner: string;
    repo: string;
    state?: 'open' | 'closed' | 'all';
    head?: string;
    base?: string;
    per_page?: number;
    page?: number;
  }
): Promise<GitHubPullRequest[]> {
  const result = await mcp.callToolWithRetry(GITHUB_MCP_SERVER, 'list_pull_requests', payload);

  if (!result.success) {
    throw parseGitHubError(result);
  }

  return result.data as GitHubPullRequest[];
}

/**
 * Merge Pull Request via GitHub MCP
 */
export async function mergeGitHubPullRequest(
  mcp: MCPToolAdapter,
  payload: {
    owner: string;
    repo: string;
    pull_number: number;
    commit_title?: string;
    commit_message?: string;
    merge_method?: 'merge' | 'squash' | 'rebase';
  }
): Promise<{ merged: boolean; message: string; sha: string }> {
  const result = await mcp.callToolWithRetry(GITHUB_MCP_SERVER, 'merge_pull_request', payload);

  if (!result.success) {
    throw parseGitHubError(result);
  }

  return result.data as { merged: boolean; message: string; sha: string };
}

/**
 * Get Pull Request Files via GitHub MCP
 */
export async function getGitHubPullRequestFiles(
  mcp: MCPToolAdapter,
  payload: {
    owner: string;
    repo: string;
    pull_number: number;
  }
): Promise<GitHubPRFile[]> {
  const result = await mcp.callToolWithRetry(GITHUB_MCP_SERVER, 'get_pull_request_files', payload);

  if (!result.success) {
    throw parseGitHubError(result);
  }

  return result.data as GitHubPRFile[];
}

/**
 * Create Pull Request Review via GitHub MCP
 */
export async function createGitHubPRReview(
  mcp: MCPToolAdapter,
  payload: {
    owner: string;
    repo: string;
    pull_number: number;
    body?: string;
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
    comments?: Array<{
      path: string;
      position?: number;
      body: string;
    }>;
  }
): Promise<{ id: number; state: string; body: string }> {
  const result = await mcp.callToolWithRetry(GITHUB_MCP_SERVER, 'create_pull_request_review', payload);

  if (!result.success) {
    throw parseGitHubError(result);
  }

  return result.data as { id: number; state: string; body: string };
}

/**
 * Create Branch via GitHub MCP
 */
export async function createGitHubBranch(
  mcp: MCPToolAdapter,
  payload: {
    owner: string;
    repo: string;
    ref: string;
    sha: string;
  }
): Promise<{ ref: string; url: string }> {
  const result = await mcp.callToolWithRetry(GITHUB_MCP_SERVER, 'create_branch', payload);

  if (!result.success) {
    throw parseGitHubError(result);
  }

  return result.data as { ref: string; url: string };
}

/**
 * Get File Contents via GitHub MCP
 */
export async function getGitHubFileContents(
  mcp: MCPToolAdapter,
  payload: {
    owner: string;
    repo: string;
    path: string;
    ref?: string;
  }
): Promise<GitHubFileContent> {
  const result = await mcp.callToolWithRetry(GITHUB_MCP_SERVER, 'get_file_contents', payload);

  if (!result.success) {
    throw parseGitHubError(result);
  }

  return result.data as GitHubFileContent;
}

/**
 * Push Files via GitHub MCP
 */
export async function pushGitHubFiles(
  mcp: MCPToolAdapter,
  payload: {
    owner: string;
    repo: string;
    branch: string;
    files: Array<{
      path: string;
      content: string;
    }>;
    message: string;
  }
): Promise<{ commit: { sha: string; url: string } }> {
  const result = await mcp.callToolWithRetry(GITHUB_MCP_SERVER, 'push_files', payload);

  if (!result.success) {
    throw parseGitHubError(result);
  }

  return result.data as { commit: { sha: string; url: string } };
}

/**
 * Search Code via GitHub MCP
 */
export async function searchGitHubCode(
  mcp: MCPToolAdapter,
  payload: {
    q: string;
    sort?: 'indexed';
    order?: 'asc' | 'desc';
    per_page?: number;
    page?: number;
  }
): Promise<{
  total_count: number;
  items: Array<{
    name: string;
    path: string;
    sha: string;
    url: string;
    repository: { full_name: string };
  }>;
}> {
  const result = await mcp.callToolWithRetry(GITHUB_MCP_SERVER, 'search_code', payload);

  if (!result.success) {
    throw parseGitHubError(result);
  }

  return result.data as {
    total_count: number;
    items: Array<{
      name: string;
      path: string;
      sha: string;
      url: string;
      repository: { full_name: string };
    }>;
  };
}

/**
 * List Commits via GitHub MCP
 */
export async function listGitHubCommits(
  mcp: MCPToolAdapter,
  payload: {
    owner: string;
    repo: string;
    sha?: string;
    path?: string;
    per_page?: number;
    page?: number;
  }
): Promise<
  Array<{
    sha: string;
    commit: {
      message: string;
      author: { name: string; email: string; date: string };
    };
    url: string;
  }>
> {
  const result = await mcp.callToolWithRetry(GITHUB_MCP_SERVER, 'list_commits', payload);

  if (!result.success) {
    throw parseGitHubError(result);
  }

  return result.data as Array<{
    sha: string;
    commit: {
      message: string;
      author: { name: string; email: string; date: string };
    };
    url: string;
  }>;
}
