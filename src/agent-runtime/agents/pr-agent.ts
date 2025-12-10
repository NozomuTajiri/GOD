/**
 * PR Agent
 *
 * Automatic Pull Request creation with Conventional Commits compliance.
 * Extended with GitHub MCP integration for PR management.
 */

import { BaseAgent, Task, AgentResult, AgentConfig } from './base-agent.js';
import { MCPToolAdapter } from '../mcp-tool-adapter.js';
import {
  GitHubPullRequest,
  GitHubAPIError,
  createGitHubPullRequest,
  getGitHubPullRequest,
  listGitHubPullRequests,
  mergeGitHubPullRequest,
  createGitHubBranch,
  pushGitHubFiles,
  listGitHubCommits,
} from './github-mcp-mixin.js';

/**
 * Conventional Commit Types
 */
export const COMMIT_TYPES = {
  feat: 'A new feature',
  fix: 'A bug fix',
  docs: 'Documentation only changes',
  style: 'Changes that do not affect the meaning of the code',
  refactor: 'A code change that neither fixes a bug nor adds a feature',
  perf: 'A code change that improves performance',
  test: 'Adding missing tests or correcting existing tests',
  build: 'Changes that affect the build system or external dependencies',
  ci: 'Changes to CI configuration files and scripts',
  chore: 'Other changes that do not modify src or test files',
  revert: 'Reverts a previous commit',
} as const;

export type CommitType = keyof typeof COMMIT_TYPES;

/**
 * PR Creation Result
 */
export interface PRCreationResult {
  prUrl: string;
  prNumber: number;
  title: string;
  body: string;
  branch: string;
  baseBranch: string;
  isDraft: boolean;
  labels: string[];
  linkedIssues: number[];
  changeSummary: ChangeSummary;
  testPlan: string;
}

/**
 * Change Summary
 */
export interface ChangeSummary {
  filesChanged: number;
  insertions: number;
  deletions: number;
  filesByType: Record<string, number>;
  components: string[];
}

/**
 * File Change
 */
export interface FileChange {
  path: string;
  content: string;
  status: 'added' | 'modified' | 'deleted';
}

/**
 * PR Agent Configuration
 */
export interface PRAgentConfig extends AgentConfig {
  githubToken?: string;
  defaultBaseBranch?: string;
  draftByDefault?: boolean;
  mcpAdapter?: MCPToolAdapter;
  defaultOwner?: string;
  defaultRepo?: string;
}

/**
 * PR Agent Implementation
 */
export class PRAgent extends BaseAgent {
  private githubToken?: string;
  private defaultBaseBranch: string;
  private draftByDefault: boolean;
  private mcp?: MCPToolAdapter;
  private defaultOwner?: string;
  private defaultRepo?: string;

  constructor(config: PRAgentConfig) {
    super('pr', config);
    this.githubToken = config.githubToken;
    this.defaultBaseBranch = config.defaultBaseBranch || 'main';
    this.draftByDefault = config.draftByDefault ?? true;
    this.mcp = config.mcpAdapter;
    this.defaultOwner = config.defaultOwner;
    this.defaultRepo = config.defaultRepo;
  }

  /**
   * Set MCP adapter
   */
  setMCPAdapter(mcp: MCPToolAdapter): void {
    this.mcp = mcp;
  }

  /**
   * Set default repository
   */
  setDefaultRepository(owner: string, repo: string): void {
    this.defaultOwner = owner;
    this.defaultRepo = repo;
  }

  /**
   * Create a GitHub Pull Request via MCP
   */
  async createGitHubPR(payload: {
    owner?: string;
    repo?: string;
    title: string;
    body: string;
    head: string;
    base?: string;
    draft?: boolean;
  }): Promise<GitHubPullRequest> {
    if (!this.mcp) {
      throw new Error('MCP adapter not configured');
    }

    const owner = payload.owner || this.defaultOwner;
    const repo = payload.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error('Owner and repo must be specified');
    }

    const base = payload.base || this.defaultBaseBranch;
    const draft = payload.draft ?? this.draftByDefault;

    this.log('Creating GitHub pull request', {
      owner,
      repo,
      title: payload.title,
      head: payload.head,
      base,
      draft,
    });

    try {
      const pr = await createGitHubPullRequest(this.mcp, {
        owner,
        repo,
        title: payload.title,
        body: payload.body,
        head: payload.head,
        base,
        draft,
      });

      this.log('GitHub pull request created', {
        number: pr.number,
        url: pr.html_url,
      });

      return pr;
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        await this.handleGitHubAPIError(error, 'createPullRequest');
      }
      throw error;
    }
  }

  /**
   * Get a GitHub Pull Request via MCP
   */
  async getGitHubPR(payload: {
    owner?: string;
    repo?: string;
    pull_number: number;
  }): Promise<GitHubPullRequest> {
    if (!this.mcp) {
      throw new Error('MCP adapter not configured');
    }

    const owner = payload.owner || this.defaultOwner;
    const repo = payload.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error('Owner and repo must be specified');
    }

    try {
      return await getGitHubPullRequest(this.mcp, {
        owner,
        repo,
        pull_number: payload.pull_number,
      });
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        await this.handleGitHubAPIError(error, 'getPullRequest');
      }
      throw error;
    }
  }

  /**
   * List GitHub Pull Requests via MCP
   */
  async listGitHubPRs(payload: {
    owner?: string;
    repo?: string;
    state?: 'open' | 'closed' | 'all';
    head?: string;
    base?: string;
    per_page?: number;
    page?: number;
  }): Promise<GitHubPullRequest[]> {
    if (!this.mcp) {
      throw new Error('MCP adapter not configured');
    }

    const owner = payload.owner || this.defaultOwner;
    const repo = payload.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error('Owner and repo must be specified');
    }

    try {
      return await listGitHubPullRequests(this.mcp, {
        owner,
        repo,
        state: payload.state,
        head: payload.head,
        base: payload.base,
        per_page: payload.per_page,
        page: payload.page,
      });
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        await this.handleGitHubAPIError(error, 'listPullRequests');
      }
      throw error;
    }
  }

  /**
   * Merge a GitHub Pull Request via MCP
   */
  async mergeGitHubPR(payload: {
    owner?: string;
    repo?: string;
    pull_number: number;
    commit_title?: string;
    commit_message?: string;
    merge_method?: 'merge' | 'squash' | 'rebase';
  }): Promise<{ merged: boolean; message: string; sha: string }> {
    if (!this.mcp) {
      throw new Error('MCP adapter not configured');
    }

    const owner = payload.owner || this.defaultOwner;
    const repo = payload.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error('Owner and repo must be specified');
    }

    this.log('Merging GitHub pull request', {
      owner,
      repo,
      pull_number: payload.pull_number,
      merge_method: payload.merge_method,
    });

    try {
      const result = await mergeGitHubPullRequest(this.mcp, {
        owner,
        repo,
        pull_number: payload.pull_number,
        commit_title: payload.commit_title,
        commit_message: payload.commit_message,
        merge_method: payload.merge_method,
      });

      this.log('GitHub pull request merged', {
        merged: result.merged,
        sha: result.sha,
      });

      return result;
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        await this.handleGitHubAPIError(error, 'mergePullRequest');
      }
      throw error;
    }
  }

  /**
   * Create a GitHub Branch via MCP
   */
  async createBranch(payload: {
    owner?: string;
    repo?: string;
    ref: string;
    sha: string;
  }): Promise<{ ref: string; url: string }> {
    if (!this.mcp) {
      throw new Error('MCP adapter not configured');
    }

    const owner = payload.owner || this.defaultOwner;
    const repo = payload.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error('Owner and repo must be specified');
    }

    this.log('Creating GitHub branch', {
      owner,
      repo,
      ref: payload.ref,
    });

    try {
      const result = await createGitHubBranch(this.mcp, {
        owner,
        repo,
        ref: payload.ref,
        sha: payload.sha,
      });

      this.log('GitHub branch created', { ref: result.ref });

      return result;
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        await this.handleGitHubAPIError(error, 'createBranch');
      }
      throw error;
    }
  }

  /**
   * Push files to GitHub via MCP
   */
  async pushFiles(payload: {
    owner?: string;
    repo?: string;
    branch: string;
    files: Array<{ path: string; content: string }>;
    message: string;
  }): Promise<{ commit: { sha: string; url: string } }> {
    if (!this.mcp) {
      throw new Error('MCP adapter not configured');
    }

    const owner = payload.owner || this.defaultOwner;
    const repo = payload.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error('Owner and repo must be specified');
    }

    this.log('Pushing files to GitHub', {
      owner,
      repo,
      branch: payload.branch,
      fileCount: payload.files.length,
    });

    try {
      const result = await pushGitHubFiles(this.mcp, {
        owner,
        repo,
        branch: payload.branch,
        files: payload.files,
        message: payload.message,
      });

      this.log('Files pushed to GitHub', { sha: result.commit.sha });

      return result;
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        await this.handleGitHubAPIError(error, 'pushFiles');
      }
      throw error;
    }
  }

  /**
   * Get latest commit SHA for branch
   */
  async getLatestCommitSHA(payload: {
    owner?: string;
    repo?: string;
    branch?: string;
  }): Promise<string> {
    if (!this.mcp) {
      throw new Error('MCP adapter not configured');
    }

    const owner = payload.owner || this.defaultOwner;
    const repo = payload.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error('Owner and repo must be specified');
    }

    try {
      const commits = await listGitHubCommits(this.mcp, {
        owner,
        repo,
        sha: payload.branch || this.defaultBaseBranch,
        per_page: 1,
      });

      if (commits.length === 0) {
        throw new Error('No commits found');
      }

      return commits[0].sha;
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        await this.handleGitHubAPIError(error, 'getLatestCommitSHA');
      }
      throw error;
    }
  }

  /**
   * Handle GitHub API errors with escalation
   */
  private async handleGitHubAPIError(
    error: GitHubAPIError,
    operation: string
  ): Promise<void> {
    if (error.isRateLimited()) {
      await this.escalate(
        `GitHub API rate limit exceeded during ${operation}`,
        'DevOps',
        'Sev.2-High',
        {
          operation,
          rateLimitReset: error.rateLimitReset?.toISOString(),
        }
      );
    } else if (error.isAuthError()) {
      await this.escalate(
        `GitHub API authentication error during ${operation}`,
        'DevOps',
        'Sev.1-Critical',
        { operation }
      );
    }
  }

  /**
   * Execute PR creation task
   */
  async execute(task: Task): Promise<AgentResult> {
    this.log('Starting PR creation', { taskId: task.id });

    try {
      // Extract PR data from task payload
      const prData = this.extractPRData(task);

      // Generate PR title (Conventional Commits)
      const title = this.generateTitle(prData);

      // Generate change summary
      const changeSummary = this.generateChangeSummary(prData.files);

      // Generate PR body
      const body = this.generateBody(prData, changeSummary);

      // Generate test plan
      const testPlan = this.generateTestPlan(prData, changeSummary);

      // Create branch name
      const branch = this.generateBranchName(prData);

      // Create the PR (simulated - actual implementation would use GitHub API)
      const prResult = await this.createPullRequest({
        title,
        body,
        branch,
        baseBranch: prData.baseBranch || this.defaultBaseBranch,
        isDraft: prData.isDraft ?? this.draftByDefault,
        labels: this.determineLabels(prData),
        linkedIssues: prData.linkedIssues || [],
        files: prData.files,
      });

      const result: PRCreationResult = {
        ...prResult,
        changeSummary,
        testPlan,
      };

      this.log('PR creation completed', {
        taskId: task.id,
        prNumber: result.prNumber,
        title: result.title,
      });

      return this.createSuccessResult(task, result);
    } catch (error) {
      this.logError('PR creation failed', error as Error, { taskId: task.id });

      // Check for merge conflicts
      if (this.isMergeConflict(error as Error)) {
        await this.escalate(
          'Merge conflict detected, cannot create PR',
          'TechLead',
          'Sev.2-High',
          { taskId: task.id, error: (error as Error).message }
        );
      }

      return this.createFailureResult(task, error as Error);
    }
  }

  /**
   * Extract PR data from task payload
   */
  private extractPRData(task: Task): {
    type: CommitType;
    scope?: string;
    description: string;
    files: FileChange[];
    linkedIssues?: number[];
    baseBranch?: string;
    isDraft?: boolean;
    breaking?: boolean;
    reviewResult?: {
      passed: boolean;
      qualityScore: number;
    };
  } {
    const payload = task.payload;
    return {
      type: (payload.type as CommitType) || 'feat',
      scope: payload.scope as string | undefined,
      description: (payload.description as string) || 'Update code',
      files: (payload.files as FileChange[]) || [],
      linkedIssues: payload.linkedIssues as number[] | undefined,
      baseBranch: payload.baseBranch as string | undefined,
      isDraft: payload.isDraft as boolean | undefined,
      breaking: payload.breaking as boolean | undefined,
      reviewResult: payload.reviewResult as { passed: boolean; qualityScore: number } | undefined,
    };
  }

  /**
   * Generate PR title following Conventional Commits
   */
  generateTitle(prData: {
    type: CommitType;
    scope?: string;
    description: string;
    breaking?: boolean;
  }): string {
    const { type, scope, description, breaking } = prData;

    // Capitalize first letter of description
    const capitalizedDesc = description.charAt(0).toUpperCase() + description.slice(1);

    // Build title
    let title = type;
    if (scope) {
      title += '(' + scope + ')';
    }
    if (breaking) {
      title += '!';
    }
    title += ': ' + capitalizedDesc;

    return title;
  }

  /**
   * Generate change summary from files
   */
  generateChangeSummary(files: FileChange[]): ChangeSummary {
    const filesByType: Record<string, number> = {};
    const components = new Set<string>();
    let insertions = 0;
    let deletions = 0;

    for (const file of files) {
      // Count by file extension
      const ext = file.path.split('.').pop() || 'other';
      filesByType[ext] = (filesByType[ext] || 0) + 1;

      // Detect component from path
      const component = this.detectComponent(file.path);
      if (component) {
        components.add(component);
      }

      // Estimate insertions/deletions
      if (file.status === 'added') {
        insertions += file.content.split('\n').length;
      } else if (file.status === 'deleted') {
        deletions += file.content.split('\n').length;
      } else {
        // For modified, estimate half and half
        const lines = file.content.split('\n').length;
        insertions += Math.floor(lines * 0.6);
        deletions += Math.floor(lines * 0.4);
      }
    }

    return {
      filesChanged: files.length,
      insertions,
      deletions,
      filesByType,
      components: Array.from(components),
    };
  }

  /**
   * Detect component from file path
   */
  private detectComponent(path: string): string | null {
    if (path.includes('frontend') || path.includes('components') || path.includes('pages')) {
      return 'frontend';
    }
    if (path.includes('api') || path.includes('handlers')) {
      return 'api';
    }
    if (path.includes('infrastructure') || path.includes('cdk')) {
      return 'infrastructure';
    }
    if (path.includes('database') || path.includes('migrations')) {
      return 'database';
    }
    if (path.includes('test') || path.includes('__tests__')) {
      return 'tests';
    }
    if (path.includes('agent')) {
      return 'agents';
    }
    return null;
  }

  /**
   * Generate PR body
   */
  generateBody(
    prData: {
      type: CommitType;
      scope?: string;
      description: string;
      linkedIssues?: number[];
      breaking?: boolean;
      reviewResult?: { passed: boolean; qualityScore: number };
    },
    changeSummary: ChangeSummary
  ): string {
    const sections: string[] = [];

    // Summary section
    sections.push('## Summary');
    sections.push(this.generateSummaryBullets(prData, changeSummary));

    // Changes section
    sections.push('\n## Changes');
    sections.push('- **Files changed:** ' + changeSummary.filesChanged);
    sections.push('- **Insertions:** +' + changeSummary.insertions);
    sections.push('- **Deletions:** -' + changeSummary.deletions);

    if (changeSummary.components.length > 0) {
      sections.push('- **Components affected:** ' + changeSummary.components.join(', '));
    }

    // File types
    const fileTypes = Object.entries(changeSummary.filesByType)
      .map(function(entry) { return entry[0] + ': ' + entry[1]; })
      .join(', ');
    sections.push('- **File types:** ' + fileTypes);

    // Breaking changes
    if (prData.breaking) {
      sections.push('\n## Breaking Changes');
      sections.push('This PR contains breaking changes. Please review carefully.');
    }

    // Review status
    if (prData.reviewResult) {
      sections.push('\n## Review Status');
      sections.push('- **Quality Score:** ' + prData.reviewResult.qualityScore + '/100');
      sections.push('- **Status:** ' + (prData.reviewResult.passed ? 'Passed' : 'Failed'));
    }

    // Linked issues
    if (prData.linkedIssues && prData.linkedIssues.length > 0) {
      sections.push('\n## Related Issues');
      for (const issue of prData.linkedIssues) {
        sections.push('- Closes #' + issue);
      }
    }

    // Footer
    sections.push('\n---');
    sections.push('Generated with Claude Code');

    return sections.join('\n');
  }

  /**
   * Generate summary bullets
   */
  private generateSummaryBullets(
    prData: { type: CommitType; description: string },
    changeSummary: ChangeSummary
  ): string {
    const bullets: string[] = [];

    // Main change description
    bullets.push('- ' + COMMIT_TYPES[prData.type] + ': ' + prData.description);

    // Component-specific bullets
    for (const component of changeSummary.components) {
      bullets.push('- Updates to ' + component + ' component');
    }

    return bullets.join('\n');
  }

  /**
   * Generate test plan
   */
  generateTestPlan(
    prData: { type: CommitType; scope?: string },
    changeSummary: ChangeSummary
  ): string {
    const testItems: string[] = [];

    // Type-specific tests
    switch (prData.type) {
      case 'feat':
        testItems.push('- [ ] Verify new feature works as expected');
        testItems.push('- [ ] Test edge cases');
        testItems.push('- [ ] Verify no regression in existing functionality');
        break;
      case 'fix':
        testItems.push('- [ ] Verify the bug is fixed');
        testItems.push('- [ ] Test the original reproduction steps no longer fail');
        testItems.push('- [ ] Verify no new bugs introduced');
        break;
      case 'refactor':
        testItems.push('- [ ] Verify functionality remains unchanged');
        testItems.push('- [ ] Run full test suite');
        testItems.push('- [ ] Check performance metrics');
        break;
      case 'perf':
        testItems.push('- [ ] Benchmark before and after');
        testItems.push('- [ ] Verify no functional regression');
        break;
      default:
        testItems.push('- [ ] Run automated tests');
        testItems.push('- [ ] Manual verification');
    }

    // Component-specific tests
    for (const component of changeSummary.components) {
      switch (component) {
        case 'frontend':
          testItems.push('- [ ] Test UI in different browsers');
          testItems.push('- [ ] Check responsive design');
          break;
        case 'api':
          testItems.push('- [ ] Test API endpoints');
          testItems.push('- [ ] Verify request/response schemas');
          break;
        case 'database':
          testItems.push('- [ ] Test database migrations');
          testItems.push('- [ ] Verify data integrity');
          break;
        case 'infrastructure':
          testItems.push('- [ ] Test CDK synth');
          testItems.push('- [ ] Verify in staging environment');
          break;
      }
    }

    return testItems.join('\n');
  }

  /**
   * Generate branch name
   */
  generateBranchName(prData: {
    type: CommitType;
    scope?: string;
    description: string;
    linkedIssues?: number[];
  }): string {
    // Sanitize description for branch name
    const sanitized = prData.description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);

    let branch = prData.type + '/' + sanitized;

    // Add issue number if available
    if (prData.linkedIssues && prData.linkedIssues.length > 0) {
      branch = prData.type + '/issue-' + prData.linkedIssues[0] + '-' + sanitized;
    }

    return branch;
  }

  /**
   * Determine labels for PR
   */
  private determineLabels(prData: {
    type: CommitType;
    breaking?: boolean;
    reviewResult?: { passed: boolean; qualityScore: number };
  }): string[] {
    const labels: string[] = [];

    // Type label
    labels.push('type:' + prData.type);

    // Breaking change label
    if (prData.breaking) {
      labels.push('breaking-change');
    }

    // Review status label
    if (prData.reviewResult) {
      if (prData.reviewResult.passed) {
        labels.push('review:approved');
      } else {
        labels.push('review:changes-requested');
      }
    }

    return labels;
  }

  /**
   * Create Pull Request (simulated)
   */
  private async createPullRequest(options: {
    title: string;
    body: string;
    branch: string;
    baseBranch: string;
    isDraft: boolean;
    labels: string[];
    linkedIssues: number[];
    files: FileChange[];
  }): Promise<Omit<PRCreationResult, 'changeSummary' | 'testPlan'>> {
    this.log('Creating pull request', {
      title: options.title,
      branch: options.branch,
      baseBranch: options.baseBranch,
      isDraft: options.isDraft,
    });

    // In a real implementation, this would:
    // 1. Create a new branch using simple-git
    // 2. Commit the file changes
    // 3. Push to remote
    // 4. Create PR using GitHub API (@octokit/rest)

    // For now, return simulated result
    const prNumber = Math.floor(Math.random() * 1000) + 1;

    return {
      prUrl: 'https://github.com/owner/repo/pull/' + prNumber,
      prNumber,
      title: options.title,
      body: options.body,
      branch: options.branch,
      baseBranch: options.baseBranch,
      isDraft: options.isDraft,
      labels: options.labels,
      linkedIssues: options.linkedIssues,
    };
  }

  /**
   * Check if error is a merge conflict
   */
  private isMergeConflict(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('conflict') || message.includes('merge');
  }

  /**
   * Validate Conventional Commit format
   */
  static validateConventionalCommit(title: string): boolean {
    const pattern = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?:\s.+$/;
    return pattern.test(title);
  }

  /**
   * Parse Conventional Commit title
   */
  static parseConventionalCommit(title: string): {
    type: CommitType;
    scope?: string;
    breaking: boolean;
    description: string;
  } | null {
    const pattern = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\((.+)\))?(!)?\:\s(.+)$/;
    const match = title.match(pattern);

    if (!match) {
      return null;
    }

    return {
      type: match[1] as CommitType,
      scope: match[2] || undefined,
      breaking: match[3] === '!',
      description: match[4],
    };
  }
}
