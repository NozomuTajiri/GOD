/**
 * GitHub MCP Integration Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPToolAdapter } from '../../mcp-tool-adapter.js';
import {
  GitHubAPIError,
  parseGitHubError,
  createGitHubIssue,
  updateGitHubIssue,
  addIssueComment,
  createGitHubPullRequest,
  mergeGitHubPullRequest,
  getGitHubFileContents,
  getGitHubPullRequestFiles,
} from '../github-mcp-mixin.js';

// Mock MCPToolAdapter
const mockCallToolWithRetry = vi.fn();

const mockMCPAdapter = {
  callToolWithRetry: mockCallToolWithRetry,
  callTool: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  isConnected: vi.fn().mockReturnValue(true),
} as unknown as MCPToolAdapter;

describe('GitHub MCP Mixin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GitHubAPIError', () => {
    it('should create error with status code', () => {
      const error = new GitHubAPIError('Test error', 404);
      expect(error.statusCode).toBe(404);
      expect(error.isNotFound()).toBe(true);
    });

    it('should detect rate limit error', () => {
      const error = new GitHubAPIError('Rate limit exceeded', 403, 0);
      expect(error.isRateLimited()).toBe(true);
    });

    it('should detect auth error', () => {
      const error = new GitHubAPIError('Unauthorized', 401);
      expect(error.isAuthError()).toBe(true);
    });
  });

  describe('parseGitHubError', () => {
    it('should parse error from MCP result', () => {
      const result = { success: false, error: 'status: 404 Not Found' };
      const error = parseGitHubError(result);
      expect(error.statusCode).toBe(404);
    });

    it('should detect rate limit in error message', () => {
      const result = { success: false, error: 'API rate limit exceeded' };
      const error = parseGitHubError(result);
      expect(error.rateLimitRemaining).toBe(0);
    });
  });

  describe('createGitHubIssue', () => {
    it('should create issue successfully', async () => {
      const mockIssue = {
        number: 123,
        title: 'Test Issue',
        body: 'Test body',
        state: 'open',
        labels: [],
        assignees: [],
        url: 'https://api.github.com/repos/owner/repo/issues/123',
        html_url: 'https://github.com/owner/repo/issues/123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: mockIssue,
      });

      const result = await createGitHubIssue(mockMCPAdapter, {
        owner: 'owner',
        repo: 'repo',
        title: 'Test Issue',
        body: 'Test body',
      });

      expect(result.number).toBe(123);
      expect(result.title).toBe('Test Issue');
      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        'github',
        'create_issue',
        expect.objectContaining({
          owner: 'owner',
          repo: 'repo',
          title: 'Test Issue',
        })
      );
    });

    it('should throw error on failure', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: false,
        error: 'Repository not found',
      });

      await expect(
        createGitHubIssue(mockMCPAdapter, {
          owner: 'owner',
          repo: 'repo',
          title: 'Test Issue',
          body: 'Test body',
        })
      ).rejects.toThrow(GitHubAPIError);
    });
  });

  describe('updateGitHubIssue', () => {
    it('should update issue successfully', async () => {
      const mockIssue = {
        number: 123,
        title: 'Updated Title',
        body: 'Test body',
        state: 'closed',
        labels: ['bug'],
        assignees: [],
        url: 'https://api.github.com/repos/owner/repo/issues/123',
        html_url: 'https://github.com/owner/repo/issues/123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: mockIssue,
      });

      const result = await updateGitHubIssue(mockMCPAdapter, {
        owner: 'owner',
        repo: 'repo',
        issue_number: 123,
        title: 'Updated Title',
        state: 'closed',
      });

      expect(result.state).toBe('closed');
      expect(result.title).toBe('Updated Title');
    });
  });

  describe('addIssueComment', () => {
    it('should add comment successfully', async () => {
      const mockComment = {
        id: 456,
        body: 'Test comment',
        url: 'https://api.github.com/repos/owner/repo/issues/comments/456',
      };

      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: mockComment,
      });

      const result = await addIssueComment(mockMCPAdapter, {
        owner: 'owner',
        repo: 'repo',
        issue_number: 123,
        body: 'Test comment',
      });

      expect(result.id).toBe(456);
      expect(result.body).toBe('Test comment');
    });
  });

  describe('createGitHubPullRequest', () => {
    it('should create PR successfully', async () => {
      const mockPR = {
        number: 100,
        title: 'Test PR',
        body: 'PR body',
        state: 'open',
        head: { ref: 'feature', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        url: 'https://api.github.com/repos/owner/repo/pulls/100',
        html_url: 'https://github.com/owner/repo/pull/100',
        draft: true,
        mergeable: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        merged_at: null,
      };

      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: mockPR,
      });

      const result = await createGitHubPullRequest(mockMCPAdapter, {
        owner: 'owner',
        repo: 'repo',
        title: 'Test PR',
        body: 'PR body',
        head: 'feature',
        base: 'main',
        draft: true,
      });

      expect(result.number).toBe(100);
      expect(result.draft).toBe(true);
    });
  });

  describe('mergeGitHubPullRequest', () => {
    it('should merge PR successfully', async () => {
      const mockResult = {
        merged: true,
        message: 'Pull Request successfully merged',
        sha: 'merged123',
      };

      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: mockResult,
      });

      const result = await mergeGitHubPullRequest(mockMCPAdapter, {
        owner: 'owner',
        repo: 'repo',
        pull_number: 100,
        merge_method: 'squash',
      });

      expect(result.merged).toBe(true);
      expect(result.sha).toBe('merged123');
    });
  });

  describe('getGitHubFileContents', () => {
    it('should get file contents successfully', async () => {
      const mockContent = {
        name: 'test.ts',
        path: 'src/test.ts',
        sha: 'file123',
        size: 100,
        content: 'Y29uc29sZS5sb2coImhlbGxvIik=', // base64 encoded
        encoding: 'base64',
      };

      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: mockContent,
      });

      const result = await getGitHubFileContents(mockMCPAdapter, {
        owner: 'owner',
        repo: 'repo',
        path: 'src/test.ts',
      });

      expect(result.path).toBe('src/test.ts');
      expect(result.encoding).toBe('base64');
    });
  });

  describe('getGitHubPullRequestFiles', () => {
    it('should get PR files successfully', async () => {
      const mockFiles = [
        {
          sha: 'file1',
          filename: 'src/main.ts',
          status: 'modified',
          additions: 10,
          deletions: 5,
          changes: 15,
          patch: '@@ -1,5 +1,10 @@',
        },
        {
          sha: 'file2',
          filename: 'src/utils.ts',
          status: 'added',
          additions: 20,
          deletions: 0,
          changes: 20,
        },
      ];

      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: mockFiles,
      });

      const result = await getGitHubPullRequestFiles(mockMCPAdapter, {
        owner: 'owner',
        repo: 'repo',
        pull_number: 100,
      });

      expect(result).toHaveLength(2);
      expect(result[0].filename).toBe('src/main.ts');
      expect(result[1].status).toBe('added');
    });
  });
});

describe('Agent GitHub MCP Integration', () => {
  describe('IssueAgent', () => {
    it('should have createIssue method', async () => {
      // Import dynamically to avoid initialization issues
      const { IssueAgent } = await import('../issue-agent.js');
      const { Logger } = await import('../../config/logger.js');

      const logger = new Logger({ level: 'error' });
      const agent = new IssueAgent({
        agentType: 'issue',
        logger,
        mcpAdapter: mockMCPAdapter,
        defaultOwner: 'owner',
        defaultRepo: 'repo',
      });

      expect(agent.createIssue).toBeDefined();
      expect(agent.updateIssue).toBeDefined();
      expect(agent.addComment).toBeDefined();
      expect(agent.listIssues).toBeDefined();
      expect(agent.searchIssues).toBeDefined();
    });
  });

  describe('PRAgent', () => {
    it('should have createGitHubPR method', async () => {
      const { PRAgent } = await import('../pr-agent.js');
      const { Logger } = await import('../../config/logger.js');

      const logger = new Logger({ level: 'error' });
      const agent = new PRAgent({
        agentType: 'pr',
        logger,
        mcpAdapter: mockMCPAdapter,
        defaultOwner: 'owner',
        defaultRepo: 'repo',
      });

      expect(agent.createGitHubPR).toBeDefined();
      expect(agent.getGitHubPR).toBeDefined();
      expect(agent.listGitHubPRs).toBeDefined();
      expect(agent.mergeGitHubPR).toBeDefined();
      expect(agent.createBranch).toBeDefined();
      expect(agent.pushFiles).toBeDefined();
    });
  });

  describe('ReviewAgent', () => {
    it('should have getFileContents method', async () => {
      const { ReviewAgent } = await import('../review-agent.js');
      const { Logger } = await import('../../config/logger.js');

      const logger = new Logger({ level: 'error' });
      const agent = new ReviewAgent({
        agentType: 'review',
        logger,
        mcpAdapter: mockMCPAdapter,
        defaultOwner: 'owner',
        defaultRepo: 'repo',
      });

      expect(agent.getFileContents).toBeDefined();
      expect(agent.getPullRequestFiles).toBeDefined();
      expect(agent.createPRReview).toBeDefined();
      expect(agent.searchCode).toBeDefined();
      expect(agent.reviewPullRequest).toBeDefined();
    });
  });
});
